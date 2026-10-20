import { z } from 'zod';
import { CATEGORY_IDS, attributeConstraints } from '../catalog/categories.js';
import { compareMoney, isValidMoney, toMoney } from '../money.js';

export const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

export const moneyString = z
  .string()
  .refine(isValidMoney, 'Invalid amount: use a decimal with up to 2 decimal places, e.g. "80.00"')
  .transform(toMoney);

export const isoDate = z.iso.date();

export const deliveryAddress = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.enum(US_STATES),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'US postal code'),
  country: z.literal('US').default('US'),
});
export type DeliveryAddress = z.output<typeof deliveryAddress>;

export const authorizationTerms = z
  .object({
    mandate: z.string().trim().min(1).max(2000),
    category: z.enum(CATEGORY_IDS),
    requiredAttributes: attributeConstraints,
    quantityMin: z.number().int().positive(),
    quantityMax: z.number().int().positive(),
    unit: z.string().trim().min(1).max(30).default('unit'),
    allowedSupplierOrgIds: z.array(z.uuid()).min(1).nullable().default(null),
    budgetTotal: moneyString,
    currency: z.literal('USD').default('USD'),
    deliveryAddress,
    deliverBy: isoDate,
    expiresAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  })
  .refine((t) => t.quantityMin <= t.quantityMax, {
    path: ['quantityMax'],
    message: 'quantityMax must be greater than or equal to quantityMin',
  })
  .refine((t) => compareMoney(t.budgetTotal, '0') > 0, {
    path: ['budgetTotal'],
    message: 'The authorized budget must be greater than zero',
  });
export type AuthorizationTermsInput = z.input<typeof authorizationTerms>;
export type AuthorizationTerms = z.output<typeof authorizationTerms>;

export const createAuthorizationInput = z.object({
  agentId: z.uuid(),
  terms: authorizationTerms,
});
export type CreateAuthorizationInput = z.input<typeof createAuthorizationInput>;

export const monthlyLimitInput = z.object({
  monthlySpendLimit: moneyString.nullable(),
});
export type MonthlyLimitInput = z.input<typeof monthlyLimitInput>;
