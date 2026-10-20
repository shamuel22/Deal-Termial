import type {
  AuthorizationTermsInput,
  CreateAgentInput,
  OfferInput,
  ProductInput,
} from '@deal/core';

export const demoBuyer = {
  organizationName: 'Taquería El Sol',
  location: { city: 'Austin', state: 'TX' },
  owner: { name: 'Taquería El Sol owner', email: 'owner@taqueria-elsol.demo' },
  monthlySpendLimit: '500.00',
  agents: [
    { name: 'Purchasing assistant', access: { buyerLevel: 'full_autonomy', sellerScopes: [] } },
    { name: 'Research assistant', access: { buyerLevel: 'search_only', sellerScopes: [] } },
    { name: 'Negotiation assistant', access: { buyerLevel: 'negotiate', sellerScopes: [] } },
  ] satisfies CreateAgentInput[],
};

export const demoMandate = {
  mandate:
    'Buy 300 containers with lids for hot food, no foam. Deliver before Friday to this address. You may negotiate and pay up to $80, including shipping and tax.',
  category: 'food_containers',
  requiredAttributes: {
    hot_food_safe: { eq: true },
    has_lid: { eq: true },
    material: { not_in: ['foam_eps'] },
  },
  quantityMin: 300,
  quantityMax: 300,
  budgetTotal: '80.00',
  deliveryAddress: {
    line1: '1100 E 6th St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78702',
  },
} satisfies Omit<AuthorizationTermsInput, 'deliverBy' | 'expiresAt'>;

const sellerScopes = [
  'publish_offers',
  'submit_quotes',
  'accept_terms',
  'approve_refunds',
] satisfies NonNullable<CreateAgentInput['access']['sellerScopes']>;

interface DemoCatalogItem {
  product: ProductInput;
  offer: Omit<OfferInput, 'productId' | 'shipRegions' | 'taxRate' | 'status'>;
}

interface DemoSeller {
  key: 'a' | 'b';
  organizationName: string;
  owner: { name: string; email: string };
  agent: CreateAgentInput;
  trackingId: string;
  shipRegions: OfferInput['shipRegions'];
  taxRate: string;
  catalog: DemoCatalogItem[];
}

export const demoSellers: DemoSeller[] = [
  {
    key: 'a',
    organizationName: 'EcoPack Texas',
    owner: { name: 'EcoPack Texas owner', email: 'owner@ecopack.demo' },
    agent: { name: 'EcoPack sales agent', access: { buyerLevel: null, sellerScopes } },
    trackingId: 'demo-seller-a',
    shipRegions: ['TX', 'OK', 'LA'],
    taxRate: '0.0825',
    catalog: [
      {
        product: {
          sku: 'ENV-KR16-L',
          name: 'Kraft container 16 oz with lid',
          category: 'food_containers',
          attributes: {
            material: 'kraft_paper',
            capacity_oz: 16,
            hot_food_safe: true,
            microwave_safe: false,
            has_lid: true,
            pack_size: 50,
          },
        },
        offer: {
          minOrderQty: 50,
          priceTiers: [
            { minQty: 50, unitPrice: '0.3100' },
            { minQty: 250, unitPrice: '0.2400' },
            // Core exige que el piso no supere ningún tramo (véase docs/demo-data.md).
            { minQty: 1000, unitPrice: '0.2200' },
          ],
          shippingFlat: '5.00',
          leadTimeDays: 2,
          stockAvailable: 4000,
          negotiationRules: {
            maxDiscount: '0.1000',
            floorUnitPrice: '0.2200',
            minQtyForDiscount: 250,
            minLeadTimeDays: 1,
            canWaiveShipping: false,
          },
        },
      },
      {
        product: {
          sku: 'ENV-PP32-L',
          name: 'PP container 32 oz, microwave safe',
          category: 'food_containers',
          attributes: {
            material: 'pp',
            capacity_oz: 32,
            hot_food_safe: true,
            microwave_safe: true,
            has_lid: true,
            pack_size: 100,
          },
        },
        offer: {
          minOrderQty: 100,
          priceTiers: [
            { minQty: 100, unitPrice: '0.4200' },
            { minQty: 500, unitPrice: '0.3600' },
          ],
          shippingFlat: '8.00',
          leadTimeDays: 3,
          stockAvailable: 2500,
          negotiationRules: { maxDiscount: '0.0500', floorUnitPrice: '0.3400', minLeadTimeDays: 2 },
        },
      },
      {
        product: {
          sku: 'ENV-FOAM9',
          name: 'Foam clamshell 9 in',
          category: 'food_containers',
          attributes: {
            material: 'foam_eps',
            capacity_oz: 24,
            hot_food_safe: true,
            has_lid: true,
            pack_size: 100,
          },
        },
        offer: {
          minOrderQty: 100,
          priceTiers: [{ minQty: 100, unitPrice: '0.1200' }],
          shippingFlat: '4.00',
          leadTimeDays: 1,
          stockAvailable: 10000,
          negotiationRules: { maxDiscount: '0', floorUnitPrice: '0.1200', minLeadTimeDays: 1 },
        },
      },
    ],
  },
  {
    key: 'b',
    organizationName: 'GreenBox Supply',
    owner: { name: 'GreenBox Supply owner', email: 'owner@greenbox.demo' },
    agent: { name: 'GreenBox sales agent', access: { buyerLevel: null, sellerScopes } },
    trackingId: 'demo-seller-b',
    shipRegions: ['TX', 'CA', 'AZ'],
    taxRate: '0.0825',
    catalog: [
      {
        product: {
          sku: 'GB-BAG24',
          name: 'Bagasse bowl 24 oz with lid',
          category: 'food_containers',
          attributes: {
            material: 'bagasse',
            capacity_oz: 24,
            hot_food_safe: true,
            microwave_safe: true,
            has_lid: true,
            pack_size: 50,
          },
        },
        offer: {
          minOrderQty: 50,
          priceTiers: [
            { minQty: 50, unitPrice: '0.3000' },
            { minQty: 300, unitPrice: '0.2500' },
          ],
          shippingFlat: '0.00',
          leadTimeDays: 2,
          stockAvailable: 3000,
          negotiationRules: {
            maxDiscount: '0.0800',
            floorUnitPrice: '0.2350',
            minQtyForDiscount: 300,
            minLeadTimeDays: 2,
            canWaiveShipping: true,
          },
        },
      },
      {
        product: {
          sku: 'GB-PET16',
          name: 'PET salad container 16 oz',
          category: 'food_containers',
          attributes: {
            material: 'pet',
            capacity_oz: 16,
            hot_food_safe: false,
            has_lid: true,
            pack_size: 50,
          },
        },
        offer: {
          minOrderQty: 50,
          priceTiers: [{ minQty: 50, unitPrice: '0.2000' }],
          shippingFlat: '3.00',
          leadTimeDays: 2,
          stockAvailable: 5000,
          negotiationRules: { maxDiscount: '0', floorUnitPrice: '0.2000', minLeadTimeDays: 2 },
        },
      },
      {
        product: {
          sku: 'GB-ALU-L',
          name: 'Aluminum tray with lid',
          category: 'food_containers',
          attributes: {
            material: 'aluminum',
            capacity_oz: 32,
            hot_food_safe: true,
            has_lid: true,
            pack_size: 50,
          },
        },
        offer: {
          minOrderQty: 50,
          priceTiers: [{ minQty: 50, unitPrice: '0.5500' }],
          shippingFlat: '10.00',
          leadTimeDays: 5,
          stockAvailable: 800,
          negotiationRules: { maxDiscount: '0.0500', floorUnitPrice: '0.5200', minLeadTimeDays: 4 },
        },
      },
    ],
  },
];
