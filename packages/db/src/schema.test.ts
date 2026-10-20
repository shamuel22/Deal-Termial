import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DbHandle } from './client.js';
import { createTestDatabase } from './testing.js';
import * as s from './schema/index.js';

let h: DbHandle;

beforeAll(async () => {
  h = await createTestDatabase();
});

afterAll(async () => {
  await h?.close();
});

async function seedBase() {
  const [org] = await h.db.insert(s.organizations).values({ name: 'Org' }).returning();
  const [user] = await h.db
    .insert(s.users)
    .values({ email: `u${Date.now()}${Math.random()}@test`, name: 'U', passwordHash: 'x' })
    .returning();
  const [agent] = await h.db
    .insert(s.agents)
    .values({ orgId: org!.id, name: 'Agent', createdByUserId: user!.id })
    .returning();
  return { org: org!, user: user!, agent: agent! };
}

describe('schema', () => {
  it('numeric values arrive as strings, without floats', async () => {
    const [org] = await h.db
      .insert(s.organizations)
      .values({ name: 'With a limit', monthlySpendLimit: '1000.10' })
      .returning();
    const [row] = await h.db.select().from(s.organizations).where(eq(s.organizations.id, org!.id));
    expect(row!.monthlySpendLimit).toBe('1000.10');
  });

  it('only one current access grant per agent', async () => {
    const { org, user, agent } = await seedBase();
    const base = { agentId: agent.id, orgId: org.id, grantedByUserId: user.id };
    await h.db.insert(s.agentAccessGrants).values({ ...base, version: 1, buyerLevel: 'negotiate' });
    await expect(
      h.db.insert(s.agentAccessGrants).values({ ...base, version: 2, buyerLevel: 'full_autonomy' }),
    ).rejects.toThrow();
  });

  it('user email is unique regardless of case', async () => {
    await h.db
      .insert(s.users)
      .values({ email: 'Dueño@Empresa.test', name: 'A', passwordHash: 'x' });
    await expect(
      h.db.insert(s.users).values({ email: 'dueño@empresa.test', name: 'B', passwordHash: 'x' }),
    ).rejects.toThrow();
  });

  it('reported stock cannot be negative', async () => {
    const { org } = await seedBase();
    const [product] = await h.db
      .insert(s.products)
      .values({
        supplierOrgId: org.id,
        sku: 'X',
        name: 'X',
        category: 'food_containers',
        attributes: {},
      })
      .returning();
    await expect(
      h.db.insert(s.offers).values({
        productId: product!.id,
        supplierOrgId: org.id,
        stockAvailable: -1,
        shipRegions: ['TX'],
        leadTimeDays: 2,
      }),
    ).rejects.toThrow();
  });
});
