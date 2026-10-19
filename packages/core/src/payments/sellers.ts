import { eq } from 'drizzle-orm';
import { schema } from '@deal/db';
import { DomainError } from '@deal/shared';
import { audit } from '../audit/audit.js';
import { inTransaction, type Executor } from '../db.js';
import { actorRef, requireAdmin, type Actor } from '../identity/actor.js';
import { notify } from '../notifications/notify.js';
import { GatewayRejectedError, type PaymentGateway } from './gateway.js';

/**
 * Conexión de cobro del proveedor con PayPal (Partner Referrals, brief §8). El servidor guarda
 * el merchant ID y comprueba con PayPal que pueda cobrar antes de dirigirle pagos.
 */

export interface SellerAccountView {
  status: 'not_connected' | 'pending' | 'active' | 'needs_attention';
  merchantId: string | null;
  paymentsReceivable: boolean;
  primaryEmailConfirmed: boolean;
  lastCheckedAt: Date | null;
}

function view(row: typeof schema.sellerAccounts.$inferSelect | undefined): SellerAccountView {
  return row
    ? {
        status: row.status,
        merchantId: row.merchantId,
        paymentsReceivable: row.paymentsReceivable,
        primaryEmailConfirmed: row.primaryEmailConfirmed,
        lastCheckedAt: row.lastCheckedAt,
      }
    : {
        status: 'not_connected',
        merchantId: null,
        paymentsReceivable: false,
        primaryEmailConfirmed: false,
        lastCheckedAt: null,
      };
}

export async function getSellerAccount(db: Executor, actor: Actor): Promise<SellerAccountView> {
  const [row] = await db
    .select()
    .from(schema.sellerAccounts)
    .where(eq(schema.sellerAccounts.orgId, actor.orgId));
  return view(row);
}

/** Genera el enlace de PayPal para que el dueño del proveedor conecte su cuenta. */
export async function startSellerOnboarding(
  db: Executor,
  gateway: PaymentGateway,
  actor: Actor,
  returnUrl: string,
): Promise<{ actionUrl: string; account: SellerAccountView }> {
  const admin = requireAdmin(actor);
  const trackingId = `org-${admin.orgId}`;
  const { actionUrl } = await gateway.createPartnerReferral(trackingId, returnUrl);
  const account = await inTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(schema.sellerAccounts)
      .values({ orgId: admin.orgId, trackingId, status: 'pending' })
      .onConflictDoUpdate({
        target: schema.sellerAccounts.orgId,
        set: { updatedAt: new Date() },
      })
      .returning();
    await audit(tx, {
      orgId: admin.orgId,
      ...actorRef(admin),
      action: 'seller_account.onboarding_started',
      resourceType: 'seller_account',
      resourceId: row!.id,
      outcome: 'succeeded',
    });
    return view(row);
  });
  return { actionUrl, account };
}

/** Consulta a PayPal el estado de la conexión y lo registra. */
export async function refreshSellerAccount(
  db: Executor,
  gateway: PaymentGateway,
  orgId: string,
): Promise<SellerAccountView> {
  const [row] = await db
    .select()
    .from(schema.sellerAccounts)
    .where(eq(schema.sellerAccounts.orgId, orgId));
  if (!row) throw new DomainError('NOT_FOUND', 'El proveedor no inició la conexión con PayPal');
  const merchantId = row.merchantId ?? (await gateway.findMerchantByTrackingId(row.trackingId));
  if (!merchantId) {
    const [updated] = await db
      .update(schema.sellerAccounts)
      .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.sellerAccounts.id, row.id))
      .returning();
    return view(updated);
  }
  let integration;
  try {
    integration = await gateway.getMerchantIntegration(merchantId);
  } catch (error) {
    if (!(error instanceof GatewayRejectedError)) throw error;
    integration = {
      merchantId,
      paymentsReceivable: false,
      primaryEmailConfirmed: false,
      scopes: [],
    };
  }
  const ready = integration.paymentsReceivable && integration.primaryEmailConfirmed;
  return inTransaction(db, async (tx) => {
    const [updated] = await tx
      .update(schema.sellerAccounts)
      .set({
        merchantId,
        status: ready ? 'active' : 'needs_attention',
        paymentsReceivable: integration.paymentsReceivable,
        primaryEmailConfirmed: integration.primaryEmailConfirmed,
        grantedScopes: integration.scopes,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.sellerAccounts.id, row.id))
      .returning();
    if (row.status !== updated!.status) {
      await audit(tx, {
        orgId,
        actorType: 'paypal',
        actorId: null,
        action: 'seller_account.status_changed',
        resourceType: 'seller_account',
        resourceId: row.id,
        outcome: 'succeeded',
        details: { from: row.status, to: updated!.status, merchantId },
      });
      await notify(tx, {
        orgId,
        kind: 'seller_account.status_changed',
        title: ready ? 'Cuenta PayPal conectada' : 'Tu cuenta PayPal requiere atención',
        body: ready
          ? 'Ya puedes recibir pagos de compradores en Deal Terminal.'
          : 'PayPal indica que la cuenta aún no puede recibir pagos o el email no está confirmado.',
        resourceType: 'seller_account',
        resourceId: row.id,
      });
    }
    return view(updated);
  });
}

export async function refreshSellerByMerchantId(
  db: Executor,
  gateway: PaymentGateway,
  merchantId: string,
) {
  const [row] = await db
    .select()
    .from(schema.sellerAccounts)
    .where(eq(schema.sellerAccounts.merchantId, merchantId));
  return row ? refreshSellerAccount(db, gateway, row.orgId) : null;
}
