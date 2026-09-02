export const CREDIT_PACK_KEYS = [
  "starter",
  "creator",
  "growth",
  "studio",
] as const;

export type CreditPackKey = (typeof CREDIT_PACK_KEYS)[number];

/**
 * These pack values are purchase-ready business settings for future checkout
 * work. Prices are internal config here until payment tables and gateways are
 * wired later.
 */
export const CREDIT_PACKS = {
  creator: {
    credits: 350,
    displayName: "Creator Pack",
    priceInrMinorUnits: 19_900,
  },
  growth: {
    credits: 950,
    displayName: "Growth Pack",
    priceInrMinorUnits: 49_900,
  },
  starter: {
    credits: 150,
    displayName: "Starter Pack",
    priceInrMinorUnits: 9_900,
  },
  studio: {
    credits: 2_100,
    displayName: "Studio Pack",
    priceInrMinorUnits: 99_900,
  },
} as const satisfies Record<
  CreditPackKey,
  {
    credits: number;
    displayName: string;
    priceInrMinorUnits: number;
  }
>;
