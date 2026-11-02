export type FlightOffer = {
  id: string;
  provider: "duffel" | "rapidapi" | "aviationstack" | "kernel";
  airline: string;
  airlineCode?: string;
  route: string;
  origin: string;
  destination: string;
  depart: string;
  arrive: string;
  stops: number;
  duration?: string;
  price: number | null;
  currency: string;
};

type SearchInput = { origin: string; destination: string; date?: string };
type JsonRecord = Record<string, unknown>;

export class FlightSearchError extends Error {
  constructor(message: string, public readonly providers: string[]) {
    super(message);
    this.name = "FlightSearchError";
  }
}

const asRecord = (value: unknown): JsonRecord => (typeof value === "object" && value !== null ? value as JsonRecord : {});
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value) || fallback;
const dateForSearch = (date?: string) => date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const code = (value: string) => value.trim().toUpperCase();

async function jsonFetch(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${asString(asRecord(body).message, response.statusText)}`);
  return asRecord(body);
}

async function searchDuffel(input: SearchInput): Promise<FlightOffer[]> {
  const key = process.env.DUFFEL_API_KEY;
  if (!key) return [];
  const body = await jsonFetch("https://api.duffel.com/air/offer_requests?return_offers=true", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "Duffel-Version": "v2" }, body: JSON.stringify({ slices: [{ origin: code(input.origin), destination: code(input.destination), departure_date: dateForSearch(input.date) }], passengers: [{ type: "adult" }], cabin_class: "economy" }) });
  const data = asRecord(body.data);
  const offers = Array.isArray(data.offers) ? data.offers : Array.isArray(body.data) ? body.data : [];
  return offers.map((raw, index) => {
    const offer = asRecord(raw);
    const slices = Array.isArray(offer.slices) ? offer.slices : [];
    const firstSlice = asRecord(slices[0]);
    const segments = Array.isArray(firstSlice.segments) ? firstSlice.segments : [];
    const first = asRecord(segments[0]);
    const last = asRecord(segments[segments.length - 1]);
    const carrier = asRecord(first.marketing_carrier);
    return { id: asString(offer.id, `duffel-${index}`), provider: "duffel", airline: asString(carrier.name, "Airline"), airlineCode: asString(carrier.iata_code), route: `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()}`, origin: input.origin, destination: input.destination, depart: asString(first.departing_at, "Scheduled"), arrive: asString(last.arriving_at, "Scheduled"), stops: Math.max(0, segments.length - 1), duration: asString(firstSlice.duration), price: asNumber(offer.total_amount), currency: asString(offer.total_currency, "USD") };
  });
}

async function rapidAirport(query: string, headers: HeadersInit) {
  const response = await jsonFetch(`https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=en-US`, { headers });
  const first = Array.isArray(response.data) ? asRecord(response.data[0]) : {};
  return { skyId: asString(first.skyId), entityId: asString(first.entityId) };
}

async function searchRapidApi(input: SearchInput): Promise<FlightOffer[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  const headers = { "x-rapidapi-key": key, "x-rapidapi-host": "sky-scrapper.p.rapidapi.com" };
  const origin = await rapidAirport(input.origin, headers);
  const destination = await rapidAirport(input.destination, headers);
  if (!origin.skyId || !destination.skyId) return [];
  const params = new URLSearchParams({ originSkyId: origin.skyId, destinationSkyId: destination.skyId, originEntityId: origin.entityId, destinationEntityId: destination.entityId, date: dateForSearch(input.date), adults: "1", currency: "USD", market: "en-US", countryCode: "US" });
  const body = await jsonFetch(`https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights?${params}`, { headers });
  const directItineraries = Array.isArray(body.data) ? body.data : [];
  const nestedItineraries = asRecord(body.data).itineraries;
  const itineraries: unknown[] = directItineraries.length > 0 ? directItineraries : Array.isArray(nestedItineraries) ? nestedItineraries : [];
  return itineraries.map<FlightOffer>((raw, index) => {
    const itinerary = asRecord(raw);
    const leg = asRecord(Array.isArray(itinerary.legs) ? itinerary.legs[0] : undefined);
    const segment = asRecord(Array.isArray(leg.segments) ? leg.segments[0] : undefined);
    const carrier = asRecord(Array.isArray(segment.operatingCarrier) ? segment.operatingCarrier[0] : segment.operatingCarrier);
    const price = asRecord(itinerary.price);
    return { id: asString(itinerary.id, `rapid-${index}`), provider: "rapidapi", airline: asString(carrier.name, "Airline"), airlineCode: asString(carrier.displayCode), route: `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()}`, origin: input.origin, destination: input.destination, depart: asString(segment.departure, "Scheduled"), arrive: asString(segment.arrival, "Scheduled"), stops: Math.max(0, asNumber(leg.stopCount)), duration: asString(leg.durationInMinutes) ? `${asString(leg.durationInMinutes)} min` : undefined, price: asNumber(price.raw, asNumber(price.amount)), currency: asString(price.currency, "USD") };
  }).filter((offer) => offer.price !== null && offer.price > 0);
}

async function searchAviationstack(input: SearchInput): Promise<FlightOffer[]> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ access_key: key, dep_iata: code(input.origin), arr_iata: code(input.destination), limit: "10" });
  const body = await jsonFetch(`https://api.aviationstack.com/v1/flights?${params}`, { headers: {} });
  const flights = Array.isArray(body.data) ? body.data : [];
  return flights.map<FlightOffer>((raw, index) => {
    const flight = asRecord(raw); const airline = asRecord(flight.airline); const departure = asRecord(flight.departure); const arrival = asRecord(flight.arrival); const flightNumber = asRecord(flight.flight);
    return { id: asString(flightNumber.iata, `aviationstack-${index}`), provider: "aviationstack", airline: asString(airline.name, "Airline"), airlineCode: asString(airline.iata), route: `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()}`, origin: input.origin, destination: input.destination, depart: asString(departure.scheduled, "Scheduled"), arrive: asString(arrival.scheduled, "Scheduled"), stops: 0, price: null, currency: "USD" };
  }).filter((offer) => offer.airline.length > 0);
}

async function searchKernel(input: SearchInput): Promise<FlightOffer[]> {
  const key = process.env.KERNEL_API_KEY;
  if (!key || process.env.ENABLE_KERNEL_FALLBACK !== "true") return [];
  const endpoint = process.env.KERNEL_API_URL ?? "https://api.onkernel.com/v1/browser/sessions";
  const body = await jsonFetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ url: "https://www.google.com/travel/flights", task: `Search one-way flights from ${input.origin} to ${input.destination} on ${dateForSearch(input.date)}. Return visible offers as JSON with airline, departure, arrival, stops, duration, price, and currency.` }) });
  const directOffers = Array.isArray(body.offers) ? body.offers : [];
  const nestedOffers = asRecord(body.data).offers;
  const offers: unknown[] = directOffers.length > 0 ? directOffers : Array.isArray(nestedOffers) ? nestedOffers : [];
  return offers.map<FlightOffer>((raw, index) => { const offer = asRecord(raw); return { id: asString(offer.id, `kernel-${index}`), provider: "kernel", airline: asString(offer.airline, "Airline"), route: `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()}`, origin: input.origin, destination: input.destination, depart: asString(offer.depart, "Scheduled"), arrive: asString(offer.arrive, "Scheduled"), stops: asNumber(offer.stops), duration: asString(offer.duration), price: asNumber(offer.price), currency: asString(offer.currency, "USD") }; }).filter((offer) => offer.price !== null && offer.price > 0);
}

export async function searchFlights(input: SearchInput) {
  const providers: Array<[string, () => Promise<FlightOffer[]>]> = [["duffel", () => searchDuffel(input)], ["rapidapi", () => searchRapidApi(input)], ["aviationstack", () => searchAviationstack(input)]];
  if (process.env.ENABLE_KERNEL_FALLBACK === "true") providers.push(["kernel", () => searchKernel(input)]);
  const attempted: string[] = [];
  for (const [name, provider] of providers) {
    attempted.push(name);
    try { const offers = await provider(); if (offers.length > 0) { console.info("flight_provider_served", { provider: name, count: offers.length, origin: input.origin, destination: input.destination }); return { provider: name, origin: input.origin, destination: input.destination, date: input.date ?? null, dateUsed: dateForSearch(input.date), options: offers, success: true }; } console.warn("flight_provider_empty", { provider: name }); } catch (error) { console.warn("flight_provider_failed", { provider: name, error: error instanceof Error ? error.message : "unknown error" }); }
  }
  console.warn("flight_search_no_results", { origin: input.origin, destination: input.destination, date: input.date, attempted });
  return { provider: null, origin: input.origin, destination: input.destination, date: input.date ?? null, dateUsed: null, options: [], success: false, message: `No live flight offers found for ${input.origin} to ${input.destination}${input.date ? ` on ${input.date}` : " (no date specified)"}. Providers checked: ${attempted.join(", ")}. ${!input.date ? "Try providing a specific departure date (YYYY-MM-DD format)." : "Try a different date or alternate route."}` };
}