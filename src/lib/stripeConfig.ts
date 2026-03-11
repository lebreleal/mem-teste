/**
 * Stripe product/price IDs and frontend config for MemoCards payments.
 * PRODUCTION MODE
 */

export const STRIPE_PLANS = {
  monthly: {
    price_id: 'price_1T9duLPu4AhOp931sLAkcCXc',
    product_id: 'prod_U7thSqa1lCZGJ8',
    label: 'Mensal',
    amount: 25_90,
    interval: 'month' as const,
    perMonth: 'R$25,90',
  },
  annual: {
    price_id: 'price_1T9duMPu4AhOp931gUf8AMs0',
    product_id: 'prod_U7thvyS5ftU7Lk',
    label: 'Anual',
    amount: 149_90,
    interval: 'year' as const,
    perMonth: 'R$12,49',
    savings: '~52% off',
  },
  lifetime: {
    price_id: 'price_1T9duOPu4AhOp931E2yTniwb',
    product_id: 'prod_U7thp7TC4BvqH0',
    label: 'Vitalício',
    amount: 299_00,
    perMonth: 'pagamento único',
    bonusCredits: 50_000,
  },
} as const;

export const STRIPE_CREDIT_PACKS = [
  { price_id: 'price_1T9duPPu4AhOp931odMSln2K', credits: 100, amount: 4_99, label: '100 créditos', price: 'R$4,99', popular: false },
  { price_id: 'price_1T9duQPu4AhOp931ujMcLTL5', credits: 200, amount: 8_99, label: '200 créditos', price: 'R$8,99', popular: false },
  { price_id: 'price_1T9duRPu4AhOp931xbFZEHwC', credits: 500, amount: 19_99, label: '500 créditos', price: 'R$19,99', popular: true },
  { price_id: 'price_1T9duSPu4AhOp9311lzQljHF', credits: 1000, amount: 24_99, label: '1000 créditos', price: 'R$24,99', popular: false },
] as const;

/** All product IDs that grant premium access */
export const PREMIUM_PRODUCT_IDS = [
  STRIPE_PLANS.monthly.product_id,
  STRIPE_PLANS.annual.product_id,
  STRIPE_PLANS.lifetime.product_id,
] as const;
