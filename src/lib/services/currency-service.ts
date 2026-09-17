interface ExchangeRateResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

export interface CachedRates {
  base: string;
  rates: Record<string, number>;
  lastUpdated: number;
}

class CurrencyRateService {
  private cache: CachedRates | null = null;
  private readonly cacheTtlMs = 12 * 60 * 60 * 1000; // 12 hours
  private inFlightPromise: Promise<CachedRates> | null = null;

  // Sensible fallback baseline rates against USD
  private readonly fallbackRates: Record<string, number> = {
    USD: 1,
    INR: 86.5,
    EUR: 0.92,
    GBP: 0.79,
    CAD: 1.38,
    AUD: 1.54,
    AED: 3.6725,
    JPY: 154.2,
    CNY: 7.24,
    SGD: 1.35,
    CHF: 0.89,
    NZD: 1.68,
    BRL: 5.62,
    MXN: 19.8,
  };

  async getRates(): Promise<CachedRates> {
    const now = Date.now();
    if (this.cache && now - this.cache.lastUpdated < this.cacheTtlMs) {
      return this.cache;
    }

    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.fetchAndCacheRates().finally(() => {
      this.inFlightPromise = null;
    });

    return this.inFlightPromise;
  }

  private async fetchAndCacheRates(): Promise<CachedRates> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as ExchangeRateResponse;
        if (data.rates && typeof data.rates === "object") {
          this.cache = {
            base: data.base_code || "USD",
            rates: {
              ...this.fallbackRates,
              ...data.rates,
            },
            lastUpdated: Date.now(),
          };
          return this.cache;
        }
      }
    } catch (err) {
      console.warn("CurrencyRateService: Failed to fetch external exchange rates, using fallback:", err);
    }

    if (this.cache) {
      return this.cache;
    }

    this.cache = {
      base: "USD",
      rates: this.fallbackRates,
      lastUpdated: Date.now(),
    };
    return this.cache;
  }
}

export const currencyRateService = new CurrencyRateService();
