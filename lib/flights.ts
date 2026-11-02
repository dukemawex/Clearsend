export type FlightOffer = {
  id: string;
  provider: "duffel" | "rapidapi" | "aviationstack";
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
  isCheapest?: boolean;
};

type SearchInput = { origin: string; destination: string; date?: string };
type JsonRecord = Record<string, unknown>;
type ProviderResult = { name: string; status: "success" | "error" | "empty"; message?: string };

const CITY_TO_IATA: Record<string, string> = {
  "new york": "JFK",
  "nyc": "JFK",
  "lagos": "LOS",
  "lag": "LOS",
  "abuja": "ABV",
  "london": "LHR",
  "lon": "LHR",
  "accra": "ACC",
  "nairobi": "NBO",
  "johannesburg": "JNB",
  "cairo": "CAI",
  "dubai": "DXB",
  "dub": "DXB",
  "paris": "CDG",
  "par": "CDG",
  "amsterdam": "AMS",
  "frankfurt": "FRA",
  "berlin": "BER",
  "ber": "BER",
  "rome": "FCO",
  "rom": "FCO",
  "milan": "MXP",
  "mil": "MXP",
  "barcelona": "BCN",
  "bar": "BCN",
  "tokyo": "NRT",
  "tyo": "NRT",
  "singapore": "SIN",
  "hong kong": "HKG",
  "los angeles": "LAX",
  "chicago": "ORD",
  "miami": "MIA",
  "toronto": "YYZ",
  "atlanta": "ATL",
  "mumbai": "BOM",
  "bom": "BOM",
  "delhi": "DEL",
  "del": "DEL",
  "sydney": "SYD",
  "syd": "SYD",
  "melbourne": "MEL",
  "mel": "MEL",
};

export class FlightSearchError extends Error {
  constructor(message: string, public readonly providers: ProviderResult[]) {
    super(message);
    this.name = "FlightSearchError";
  }
}

const asRecord = (value: unknown): JsonRecord => (typeof value === "object" && value !== null ? value as JsonRecord : {});
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value) || fallback;

function normalizeAirportCode(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (/^[a-z]{3}$/i.test(input.trim())) return input.trim().toUpperCase();
  return CITY_TO_IATA[normalized] || input.trim().toUpperCase();
}

function validateDate(date?: string): { valid: boolean; date: string | null; error?: string } {
  if (!date) {
    return { valid: false, date: null, error: "No date provided. Please specify a departure date in YYYY-MM-DD format." };
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, date: null, error: `Invalid date format '${date}'. Please use YYYY-MM-DD format.` };
  }
  
  const parsed = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (isNaN(parsed.getTime())) {
    return { valid: false, date: null, error: `Invalid date '${date}'. Please provide a valid date in YYYY-MM-DD format.` };
  }
  
  if (parsed < today) {
    return { valid: false, date: null, error: `Date '${date}' is in the past. Please provide a future date.` };
  }
  
  return { valid: true, date };
}

async function searchDuffel(input: SearchInput, date: string): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  const key = process.env.DUFFEL_API_KEY;
  if (!key) return { offers: [], status: "disabled", message: "DUFFEL_API_KEY not configured" };
  
  const isTestToken = key.startsWith("duffel_test_");
  
  try {
    const requestBody = {
      data: {
        slices: [{
          origin: normalizeAirportCode(input.origin),
          destination: normalizeAirportCode(input.destination),
          departure_date: date
        }],
        passengers: [{ type: "adult" }],
        cabin_class: "economy"
      }
    };
    
    const response = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2"
      },
      body: JSON.stringify(requestBody),
      cache: "no-store"
    });
    
    const body = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const bodyRecord = asRecord(body);
      const errors = Array.isArray(bodyRecord.errors) ? bodyRecord.errors : [];
      const errorMsg = errors.length > 0 ? asString(asRecord(errors[0]).message) : asString(bodyRecord.message, response.statusText);
      return { offers: [], status: "error", message: `Duffel HTTP ${response.status}: ${errorMsg}` };
    }
    
    const data = asRecord(asRecord(body).data);
    const offers = Array.isArray(data.offers) ? data.offers : [];
    
    const mapped = offers.map((raw, index) => {
      const offer = asRecord(raw);
      const slices = Array.isArray(offer.slices) ? offer.slices : [];
      const firstSlice = asRecord(slices[0]);
      const segments = Array.isArray(firstSlice.segments) ? firstSlice.segments : [];
      const first = asRecord(segments[0]);
      const last = asRecord(segments[segments.length - 1]);
      const carrier = asRecord(first.marketing_carrier);
      const baseAirline = asString(carrier.name, "Airline");
      return {
        id: asString(offer.id, `duffel-${index}`),
        provider: "duffel" as const,
        airline: isTestToken ? `${baseAirline} (test data)` : baseAirline,
        airlineCode: asString(carrier.iata_code),
        route: `${normalizeAirportCode(input.origin)} → ${normalizeAirportCode(input.destination)}`,
        origin: input.origin,
        destination: input.destination,
        depart: asString(first.departing_at, "Scheduled"),
        arrive: asString(last.arriving_at, "Scheduled"),
        stops: Math.max(0, segments.length - 1),
        duration: asString(firstSlice.duration),
        price: asNumber(offer.total_amount),
        currency: asString(offer.total_currency, "USD")
      };
    });
    
    const message = isTestToken ? "Duffel test token - only test/sample data available" : undefined;
    return { offers: mapped, status: mapped.length > 0 ? "success" : "empty", message };
  } catch (error) {
    return { offers: [], status: "error", message: `Duffel error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function rapidAirport(query: string, headers: HeadersInit, isCityRetry = false): Promise<{ skyId: string; entityId: string } | null> {
  try {
    const url = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=en-US`;
    const response = await fetch(url, { headers, cache: "no-store" });
    
    if (response.status === 429) {
      throw new Error("RapidAPI rate limit exceeded (429)");
    }
    
    const body = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const errorMsg = asString(asRecord(body).message, response.statusText);
      const trimmedBody = JSON.stringify(body).slice(0, 200);
      console.warn("rapidapi_airport_error", { query, status: response.status, error: errorMsg, body: trimmedBody });
      throw new Error(`${response.status} ${errorMsg}`);
    }
    
    const data = Array.isArray(body.data) ? body.data : [];
    if (data.length === 0) return null;
    
    // Find best match by IATA code or take first result
    const queryUpper = query.toUpperCase();
    const bestMatch = data.find((item: unknown) => {
      const record = asRecord(item);
      return asString(record.skyId).toUpperCase() === queryUpper;
    }) || data[0];
    
    const airport = asRecord(bestMatch);
    const navigation = asRecord(airport.navigation);
    const relevantFlightParams = asRecord(navigation.relevantFlightParams);
    
    // Check multiple possible locations for skyId and entityId
    const skyId = asString(airport.skyId) || asString(relevantFlightParams.skyId);
    const entityId = asString(navigation.entityId) || asString(relevantFlightParams.entityId);
    
    if (!skyId || !entityId) return null;
    
    console.info("rapidapi_airport_resolved", { query, skyId, entityId });
    return { skyId, entityId };
  } catch (error) {
    if (!isCityRetry) {
      console.warn("rapidapi_airport_retry_with_city", { originalQuery: query });
      // Retry with city name variations
      const cityQuery = CITY_TO_IATA[query.toLowerCase()];
      if (cityQuery && cityQuery !== query.toUpperCase()) {
        return rapidAirport(query.toLowerCase(), headers, true);
      }
    }
    throw error;
  }
}

async function searchRapidApi(input: SearchInput, date: string): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return { offers: [], status: "disabled", message: "RAPIDAPI_KEY not configured" };
  
  try {
    const headers = { "x-rapidapi-key": key, "x-rapidapi-host": "sky-scrapper.p.rapidapi.com" };
    
    const origin = await rapidAirport(normalizeAirportCode(input.origin), headers);
    const destination = await rapidAirport(normalizeAirportCode(input.destination), headers);
    
    if (!origin || !destination) {
      return { offers: [], status: "error", message: "Could not resolve airport codes for origin or destination" };
    }
    
    const params = new URLSearchParams({
      originSkyId: origin.skyId,
      destinationSkyId: destination.skyId,
      originEntityId: origin.entityId,
      destinationEntityId: destination.entityId,
      date,
      cabinClass: "economy",
      adults: "1",
      currency: "USD",
      market: "en-US",
      countryCode: "US",
      sortBy: "best"
    });
    
    let body: JsonRecord | null = null;
    let statusValue = "incomplete";
    let retries = 0;
    const maxRetries = 3;
    
    while (statusValue === "incomplete" && retries < maxRetries) {
      const response = await fetch(`https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlightsComplete?${params}`, { headers, cache: "no-store" });
      
      if (response.status === 429) {
        return { offers: [], status: "error", message: "RapidAPI quota/rate limit exceeded (429)" };
      }
      
      if (!response.ok) {
        const errorMsg = asString(asRecord(body).message, response.statusText);
        const trimmedBody = JSON.stringify(body).slice(0, 300);
        console.error("rapidapi_flight_search_error", { status: response.status, error: errorMsg, body: trimmedBody });
        return { offers: [], status: "error", message: `RapidAPI HTTP ${response.status}: ${errorMsg}` };
      }
      
      body = asRecord(await response.json().catch(() => ({})));
      statusValue = asString(body.status, "");
      
      if (statusValue === "incomplete" && retries < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
        retries++;
      } else {
        break;
      }
    }
    
    if (!body || statusValue === "incomplete") {
      return { offers: [], status: "error", message: "RapidAPI search incomplete after retries" };
    }
    
    const data = asRecord(body.data);
    const directItineraries = Array.isArray(body.data) ? body.data : [];
    const nestedItineraries = asRecord(data).itineraries;
    const itineraries: unknown[] = directItineraries.length > 0 ? directItineraries : Array.isArray(nestedItineraries) ? nestedItineraries : [];
    
    const mapped = itineraries.map<FlightOffer>((raw, index) => {
      const itinerary = asRecord(raw);
      const legs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
      const leg = asRecord(legs[0]);
      const segments = Array.isArray(leg.segments) ? leg.segments : [];
      const segment = asRecord(segments[0]);
      const carrier = asRecord(segment.operatingCarrier || segment.marketingCarrier);
      const price = asRecord(itinerary.price);
      return {
        id: asString(itinerary.id, `rapid-${index}`),
        provider: "rapidapi" as const,
        airline: asString(carrier.name, "Airline"),
        airlineCode: asString(carrier.displayCode || carrier.alternateId),
        route: `${normalizeAirportCode(input.origin)} → ${normalizeAirportCode(input.destination)}`,
        origin: input.origin,
        destination: input.destination,
        depart: asString(segment.departure, "Scheduled"),
        arrive: asString(segment.arrival, "Scheduled"),
        stops: Math.max(0, asNumber(leg.stopCount)),
        duration: asString(leg.durationInMinutes) ? `${asString(leg.durationInMinutes)} min` : undefined,
        price: asNumber(price.raw, asNumber(price.amount)),
        currency: asString(price.currency, "USD")
      };
    }).filter((offer) => offer.price !== null && offer.price > 0);
    
    return { offers: mapped, status: mapped.length > 0 ? "success" : "empty" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { offers: [], status: "error", message: `RapidAPI error: ${message}` };
  }
}

async function searchAviationstack(input: SearchInput): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { offers: [], status: "disabled", message: "AVIATIONSTACK_API_KEY not configured" };
  
  try {
    const params = new URLSearchParams({
      access_key: key,
      dep_iata: normalizeAirportCode(input.origin),
      arr_iata: normalizeAirportCode(input.destination),
      limit: "10"
    });
    
    let response: Response | null = null;
    let body: JsonRecord | null = null;
    
    try {
      response = await fetch(`https://api.aviationstack.com/v1/flights?${params}`, { cache: "no-store" });
      body = asRecord(await response.json().catch(() => ({})));
    } catch {
      response = await fetch(`http://api.aviationstack.com/v1/flights?${params}`, { cache: "no-store" });
      body = asRecord(await response.json().catch(() => ({})));
    }
    
    if (!response || !response.ok) {
      return { offers: [], status: "error", message: `Aviationstack HTTP ${response?.status || "unknown"}` };
    }
    
    const flights = Array.isArray(body.data) ? body.data : [];
    const mapped = flights.map<FlightOffer>((raw, index) => {
      const flight = asRecord(raw);
      const airline = asRecord(flight.airline);
      const departure = asRecord(flight.departure);
      const arrival = asRecord(flight.arrival);
      const flightNumber = asRecord(flight.flight);
      return {
        id: asString(flightNumber.iata, `aviationstack-${index}`),
        provider: "aviationstack" as const,
        airline: asString(airline.name, "Airline"),
        airlineCode: asString(airline.iata),
        route: `${normalizeAirportCode(input.origin)} → ${normalizeAirportCode(input.destination)}`,
        origin: input.origin,
        destination: input.destination,
        depart: asString(departure.scheduled, "Scheduled"),
        arrive: asString(arrival.scheduled, "Scheduled"),
        stops: 0,
        price: null,
        currency: "USD"
      };
    }).filter((offer) => offer.airline.length > 0);
    
    const message = "Aviationstack: live flight status only, no pricing (use for schedule reference)";
    return { offers: mapped, status: mapped.length > 0 ? "success" : "empty", message };
  } catch (error) {
    return { offers: [], status: "error", message: `Aviationstack error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function isTestData(result: { offers: FlightOffer[]; status: string; message?: string }): boolean {
  return result.offers.length > 0 && result.offers[0].provider === "duffel" && result.offers[0].airline.includes("(test data)");
}

export async function searchFlights(input: SearchInput) {
  const dateValidation = validateDate(input.date);
  
  if (!dateValidation.valid) {
    return {
      provider: null,
      origin: normalizeAirportCode(input.origin),
      destination: normalizeAirportCode(input.destination),
      date: input.date ?? null,
      dateUsed: null,
      options: [],
      success: false,
      message: dateValidation.error || "Invalid date",
      providers: []
    };
  }
  
  const date = dateValidation.date!;
  const normalizedInput = {
    origin: normalizeAirportCode(input.origin),
    destination: normalizeAirportCode(input.destination),
    date
  };
  
  const providerResults: ProviderResult[] = [];
  let firstResult: { provider: string; result: { offers: FlightOffer[]; status: string; message?: string } } | null = null;
  
  // RapidAPI first (real-time pricing)
  const rapidResult = await searchRapidApi(normalizedInput, date);
  providerResults.push({ name: "rapidapi", status: rapidResult.status as "success" | "error" | "empty", message: rapidResult.message });
  if (rapidResult.offers.length > 0 && !isTestData(rapidResult)) {
    // Mark cheapest offer
    const sortedOffers = rapidResult.offers.sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
    if (sortedOffers.length > 0 && sortedOffers[0].price !== null) {
      sortedOffers[0].isCheapest = true;
    }
    console.info("flight_provider_served", { provider: "rapidapi", count: sortedOffers.length, origin: normalizedInput.origin, destination: normalizedInput.destination, cheapestPrice: sortedOffers[0].price });
    return {
      provider: "rapidapi",
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: sortedOffers,
      success: true,
      providers: providerResults
    };
  }
  if (rapidResult.offers.length > 0 && !firstResult) {
    firstResult = { provider: "rapidapi", result: rapidResult };
  }
  
  // Duffel fallback
  const duffelResult = await searchDuffel(normalizedInput, date);
  providerResults.push({ name: "duffel", status: duffelResult.status as "success" | "error" | "empty", message: duffelResult.message });
  if (duffelResult.offers.length > 0 && !isTestData(duffelResult)) {
    // Mark cheapest offer
    const sortedOffers = duffelResult.offers.sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
    if (sortedOffers.length > 0 && sortedOffers[0].price !== null) {
      sortedOffers[0].isCheapest = true;
    }
    console.info("flight_provider_served", { provider: "duffel", count: sortedOffers.length, origin: normalizedInput.origin, destination: normalizedInput.destination, cheapestPrice: sortedOffers[0].price });
    return {
      provider: "duffel",
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: sortedOffers,
      success: true,
      providers: providerResults,
      note: duffelResult.message
    };
  }
  if (duffelResult.offers.length > 0 && !firstResult) {
    firstResult = { provider: "duffel", result: duffelResult };
  }
  
  // Aviationstack fallback (schedule only, no pricing)
  const aviastackResult = await searchAviationstack(normalizedInput);
  providerResults.push({ name: "aviationstack", status: aviastackResult.status as "success" | "error" | "empty", message: aviastackResult.message });
  if (aviastackResult.offers.length > 0) {
    console.info("flight_provider_served", { provider: "aviationstack", count: aviastackResult.offers.length, origin: normalizedInput.origin, destination: normalizedInput.destination });
    return {
      provider: "aviationstack",
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: aviastackResult.offers,
      success: true,
      providers: providerResults,
      note: aviastackResult.message
    };
  }
  
  // Fallback to test data if available
  if (firstResult) {
    // Mark cheapest in test data
    const sortedOffers = firstResult.result.offers.sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
    if (sortedOffers.length > 0 && sortedOffers[0].price !== null) {
      sortedOffers[0].isCheapest = true;
    }
    console.info("flight_provider_fallback_to_test", { provider: firstResult.provider });
    return {
      provider: firstResult.provider,
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: sortedOffers,
      success: true,
      providers: providerResults,
      note: firstResult.result.message
    };
  }
  
  console.warn("flight_search_no_results", { origin: normalizedInput.origin, destination: normalizedInput.destination, date, providers: providerResults });
  
  const errorMessages = providerResults
    .filter(p => p.status === "error" && p.message)
    .map(p => `${p.name}: ${p.message}`)
    .join("; ");
  
  const message = `No live flight offers found for ${normalizedInput.origin} to ${normalizedInput.destination} on ${date}. ${errorMessages || "All providers returned no results."}`;
  
  return {
    provider: null,
    origin: normalizedInput.origin,
    destination: normalizedInput.destination,
    date: input.date ?? null,
    dateUsed: date,
    options: [],
    success: false,
    message,
    providers: providerResults
  };
}
