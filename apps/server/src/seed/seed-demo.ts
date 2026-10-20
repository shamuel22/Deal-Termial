import {
  createAgent,
  createAuthorization,
  createOffer,
  createProduct,
  inTransaction,
  issueCredential,
  registerOwner,
  resolveAgentKey,
  resolveUserActor,
  setMonthlyLimit,
  type BuyerLevel,
  type CreateAgentInput,
  type Executor,
  type SellerScope,
  type UserActor,
} from '@deal/core';
import { schema, type Database } from '@deal/db';
import { DomainError } from '@deal/shared';
import { demoBuyer, demoMandate, demoSellers } from './demo-data.js';

const DAY_MS = 86_400_000;

/** Primer viernes a las 00:00 UTC situado al menos 72 horas después de now. */
export function nextFriday(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('The now date is invalid');
  const earliest = now.getTime() + 3 * DAY_MS;
  const friday = new Date(earliest);
  friday.setUTCHours(0, 0, 0, 0);
  friday.setUTCDate(friday.getUTCDate() + ((5 - friday.getUTCDay() + 7) % 7));
  if (friday.getTime() < earliest) friday.setUTCDate(friday.getUTCDate() + 7);
  return friday.toISOString().slice(0, 10);
}

export interface DemoOptions {
  now: Date;
  password: string;
  sellerMerchantIds: { a: string; b: string };
}

export interface DemoAgentSummary {
  id: string;
  orgId: string;
  name: string;
  buyerLevel: BuyerLevel | null;
  sellerScopes: SellerScope[];
  credentialId: string;
  apiKey: string;
}

export interface DemoSummary {
  owners: Array<{ orgId: string; userId: string; organizationName: string; email: string }>;
  agents: DemoAgentSummary[];
  authorizations: Array<{ id: string; agentId: string; agentName: string }>;
  catalog: Array<{ sku: string; productId: string; offerId: string; supplierOrgId: string }>;
  deliverBy: string;
  expiresAt: string;
}

async function seedAgent(
  tx: Executor,
  owner: UserActor,
  input: CreateAgentInput,
): Promise<DemoAgentSummary> {
  const agent = await createAgent(tx, owner, input);
  const credential = await issueCredential(tx, owner, agent.id);
  return {
    id: agent.id,
    orgId: owner.orgId,
    name: agent.name,
    buyerLevel: agent.access.buyerLevel,
    sellerScopes: agent.access.sellerScopes,
    credentialId: credential.credentialId,
    apiKey: credential.apiKey,
  };
}

/** Carga atómica: todos los servicios de core reutilizan la misma transacción. */
export async function seedDemo(db: Database, options: DemoOptions): Promise<DemoSummary> {
  const deliverBy = nextFriday(options.now);
  const expiresAt = new Date(options.now.getTime() + 30 * DAY_MS).toISOString();

  return inTransaction(db, async (tx) => {
    const existing = await tx.query.users.findFirst({
      where: (users, { sql }) => sql`lower(${users.email}) = ${demoBuyer.owner.email}`,
      columns: { id: true },
    });
    if (existing) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `The email ${demoBuyer.owner.email} already exists; no demo data was loaded.`,
        { field: 'email' },
      );
    }

    const summary: DemoSummary = {
      owners: [],
      agents: [],
      authorizations: [],
      catalog: [],
      deliverBy,
      expiresAt,
    };
    const buyerIds = await registerOwner(tx, {
      ...demoBuyer.owner,
      organizationName: demoBuyer.organizationName,
      password: options.password,
    });
    summary.owners.push({
      ...buyerIds,
      organizationName: demoBuyer.organizationName,
      email: demoBuyer.owner.email,
    });
    const buyer = await resolveUserActor(tx, buyerIds.userId, buyerIds.orgId);
    await setMonthlyLimit(tx, buyer, { monthlySpendLimit: demoBuyer.monthlySpendLimit });
    for (const input of demoBuyer.agents) {
      const agent = await seedAgent(tx, buyer, input);
      summary.agents.push(agent);
      if (agent.buyerLevel === 'full_autonomy' || agent.buyerLevel === 'negotiate') {
        const authorization = await createAuthorization(
          tx,
          buyer,
          { agentId: agent.id, terms: { ...demoMandate, deliverBy, expiresAt } },
          options.now,
        );
        summary.authorizations.push({
          id: authorization.id,
          agentId: agent.id,
          agentName: agent.name,
        });
      }
    }

    for (const seller of demoSellers) {
      const ids = await registerOwner(tx, {
        ...seller.owner,
        organizationName: seller.organizationName,
        password: options.password,
      });
      summary.owners.push({
        ...ids,
        organizationName: seller.organizationName,
        email: seller.owner.email,
      });
      const owner = await resolveUserActor(tx, ids.userId, ids.orgId);
      const agent = await seedAgent(tx, owner, seller.agent);
      summary.agents.push(agent);
      const actor = await resolveAgentKey(tx, agent.apiKey);

      // Única inserción directa: todavía no existe un servicio para seller_accounts.
      await tx.insert(schema.sellerAccounts).values({
        orgId: owner.orgId,
        status: 'active',
        trackingId: seller.trackingId,
        merchantId: options.sellerMerchantIds[seller.key],
        paymentsReceivable: true,
        primaryEmailConfirmed: true,
      });
      for (const item of seller.catalog) {
        const product = await createProduct(tx, actor, item.product);
        const offer = await createOffer(tx, actor, {
          ...item.offer,
          productId: product.id,
          status: 'active',
          shipRegions: seller.shipRegions,
          taxRate: seller.taxRate,
        });
        summary.catalog.push({
          sku: product.sku,
          productId: product.id,
          offerId: offer.id,
          supplierOrgId: owner.orgId,
        });
      }
    }
    return summary;
  });
}
