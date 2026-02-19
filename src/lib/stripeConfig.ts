/**
 * Stripe product/price IDs and frontend config for MemoCards payments.
 */

export const STRIPE_PLANS = {
  monthly: {
    price_id: 'price_1T2R4NLixpPnXFCMR9shMAF0',
    product_id: 'prod_U0Ry3cHVkiHuBq',
    label: 'Mensal',
    amount: 25_90,
    interval: 'month' as const,
    perMonth: 'R$25,90',
  },
  annual: {
    price_id: 'price_1T2R4jLixpPnXFCMSGHDWGIX',
    product_id: 'prod_U0RyXil8BOtEyS',
    label: 'Anual',
    amount: 149_90,
    interval: 'year' as const,
    perMonth: 'R$12,49',
    savings: '~52% off',
  },
  lifetime: {
    price_id: 'price_1T2R5GLixpPnXFCM7VoE3LHd',
    product_id: 'prod_U0RzkaivSVAWj8',
    label: 'Vitalício',
    amount: 299_00,
    perMonth: 'pagamento único',
    bonusCredits: 50_000,
  },
} as const;

export const STRIPE_CREDIT_PACKS = [
  { price_id: 'price_1T2R63LixpPnXFCMjn1fyW91', credits: 100, amount: 4_99, label: '100 créditos', price: 'R$4,99', popular: false },
  { price_id: 'price_1T2R69LixpPnXFCMJ0rtC6EA', credits: 200, amount: 8_99, label: '200 créditos', price: 'R$8,99', popular: false },
  { price_id: 'price_1T2R6CLixpPnXFCMf0vN8f7x', credits: 500, amount: 19_99, label: '500 créditos', price: 'R$19,99', popular: true },
  { price_id: 'price_1T2R6DLixpPnXFCMFrH58Bq7', credits: 1000, amount: 24_99, label: '1000 créditos', price: 'R$24,99', popular: false },
] as const;

/** All product IDs that grant premium access */
export const PREMIUM_PRODUCT_IDS = [
  STRIPE_PLANS.monthly.product_id,
  STRIPE_PLANS.annual.product_id,
  STRIPE_PLANS.lifetime.product_id,
] as const;
