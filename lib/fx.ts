type FxRate = {
  rate: number;
  source: string;
  timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const rateCache = new Map<string, FxRate>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchFromExchangeRateApi(from: string, to: string): Promise<number> {
  const data = await fetchJson(`https://open.er-api.com/v6/latest/${from}`) as Record<string, unknown>;
  const rates = data.rates as Record<string, number> | undefined;
  if (!rates || typeof rates[to] !== "number") throw new Error("Rate not found in response");
  return rates[to];
}

async function fetchFromFrankfurter(from: string, to: string): Promise<number> {
  const data = await fetchJson(`https://api.frankfurter.app/latest?from=${from}&to=${to}`) as Record<string, unknown>;
  const rates = data.rates as Record<string, number> | undefined;
  if (!rates || typeof rates[to] !== "number") throw new Error("Rate not found in response");
  return rates[to];
}

export async function getMidMarketRate(from: string, to: string): Promise<{ rate: number; source: string }> {
  if (from === to) return { rate: 1, source: "same-currency" };

  const cacheKey = `${from}-${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { rate: cached.rate, source: cached.source };
  }

  const providers: Array<{ name: string; fn: () => Promise<number> }> = [
    { name: "exchangerate-api", fn: () => fetchFromExchangeRateApi(from, to) },
    { name: "frankfurter", fn: () => fetchFromFrankfurter(from, to) },
  ];

  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      const rate = await provider.fn();
      if (rate > 0 && isFinite(rate)) {
        const result: FxRate = { rate, source: provider.name, timestamp: Date.now() };
        rateCache.set(cacheKey, result);
        console.info("fx_rate_fetched", { from, to, rate, source: provider.name });
        return { rate, source: provider.name };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown error");
      console.warn("fx_provider_failed", { provider: provider.name, from, to, error: lastError.message });
    }
  }

  throw new Error(
    `Unable to fetch exchange rate for ${from} to ${to}. All providers failed. ${
      lastError ? `Last error: ${lastError.message}` : ""
    }`
  );
}
