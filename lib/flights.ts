export type FlightOffer = {
  id: string;
  provider: "duffel" | "rapidapi" | "aviationstack" | "openflights" | "opensky";
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
  scheduleOnly?: boolean;
};

type SearchInput = { origin: string; destination: string; date?: string };
type JsonRecord = Record<string, unknown>;
type ProviderResult = { name: string; status: "success" | "error" | "empty"; message?: string };

// Simple in-memory cache with expiration
const cache = new Map<string, { data: unknown; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

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

// IATA to ICAO mapping for OpenSky Network
const IATA_TO_ICAO: Record<string, string> = {
  "JFK": "KJFK", "LOS": "DNMM", "ABV": "DNAA", "LHR": "EGLL", "ACC": "DGAA",
  "NBO": "HKJK", "JNB": "FAOR", "CAI": "HECA", "DXB": "OMDB", "CDG": "LFPG",
  "AMS": "EHAM", "FRA": "EDDF", "BER": "EDDB", "FCO": "LIRF", "MXP": "LIMC",
  "BCN": "LEBL", "NRT": "RJAA", "SIN": "WSSS", "HKG": "VHHH", "LAX": "KLAX",
  "ORD": "KORD", "MIA": "KMIA", "YYZ": "CYYZ", "ATL": "KATL", "BOM": "VABB",
  "DEL": "VIDP", "SYD": "YSSY", "MEL": "YMML"
};

function iataToIcao(iata: string): string | null {
  return IATA_TO_ICAO[iata.toUpperCase()] || null;
}

// OpenFlights data structures
type OpenFlightsAirline = { iata: string; icao: string; name: string; active: boolean };
type OpenFlightsRoute = { airline: string; airlineId: string; source: string; dest: string; stops: string };

async function fetchOpenFlightsData<T>(
  filename: string,
  parser: (line: string) => T | null
): Promise<T[]> {
  const cacheKey = `openflights:${filename}`;
  const cached = getCached<T[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://raw.githubusercontent.com/jpatokal/openflights/master/data/${filename}`;
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`OpenFlights fetch failed: ${response.status}`);
    
    const text = await response.text();
    const lines = text.split("\n").filter(line => line.trim().length > 0);
    const parsed = lines.map(parser).filter((item): item is T => item !== null);
    
    setCache(cacheKey, parsed, 3600000); // 1 hour cache
    return parsed;
  } catch (error) {
    console.warn("openflights_fetch_error", { filename, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getOpenFlightsAirlines(): Promise<OpenFlightsAirline[]> {
  return fetchOpenFlightsData("airlines.dat", (line) => {
    const parts = line.split(",").map(p => p.replace(/^"|"$/g, ""));
    if (parts.length < 8) return null;
    const iata = parts[3];
    const icao = parts[4];
    const active = parts[7] === "Y";
    if ((!iata || iata === "\\N" || iata === "-") && (!icao || icao === "\\N" || icao === "-")) return null;
    return { iata: iata !== "\\N" && iata !== "-" ? iata : "", icao: icao !== "\\N" && icao !== "-" ? icao : "", name: parts[1], active };
  });
}

async function getOpenFlightsRoutes(): Promise<OpenFlightsRoute[]> {
  return fetchOpenFlightsData("routes.dat", (line) => {
    const parts = line.split(",").map(p => p.replace(/^"|"$/g, ""));
    if (parts.length < 8) return null;
    const airline = parts[0];
    const airlineId = parts[1];
    const source = parts[2];
    const dest = parts[4];
    const stops = parts[7];
    if (!airline || !source || !dest || source === "\\N" || dest === "\\N") return null;
    return { airline, airlineId, source, dest, stops };
  });
}

async function searchOpenFlights(input: SearchInput): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  try {
    const originCode = normalizeAirportCode(input.origin);
    const destCode = normalizeAirportCode(input.destination);
    
    const [routes, airlines] = await Promise.all([getOpenFlightsRoutes(), getOpenFlightsAirlines()]);
    
    const matchingRoutes = routes.filter(r => r.source === originCode && r.dest === destCode);
    
    if (matchingRoutes.length === 0) {
      return { offers: [], status: "empty", message: "No routes found in OpenFlights database" };
    }
    
    const airlineMap = new Map<string, OpenFlightsAirline>();
    airlines.forEach(a => {
      if (a.iata) airlineMap.set(a.iata, a);
      if (a.icao) airlineMap.set(a.icao, a);
    });
    
    const offers: FlightOffer[] = matchingRoutes
      .slice(0, 10)
      .map((route, index) => {
        const airline = airlineMap.get(route.airline);
        const airlineName = airline?.name || `Airline ${route.airline}`;
        const stops = route.stops === "\\N" ? 0 : parseInt(route.stops, 10);
        
        return {
          id: `openflights-${index}`,
          provider: "openflights" as const,
          airline: airlineName,
          airlineCode: route.airline,
          route: `${originCode} → ${destCode}`,
          origin: input.origin,
          destination: input.destination,
          depart: "Schedule only",
          arrive: "Schedule only",
          stops: isNaN(stops) ? 0 : stops,
          price: null,
          currency: "USD",
          scheduleOnly: true
        };
      });
    
    return { 
      offers, 
      status: "success", 
      message: "OpenFlights schedule data - fare unavailable" 
    };
  } catch (error) {
    return { offers: [], status: "error", message: `OpenFlights error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function searchOpenSky(input: SearchInput, date: string): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  try {
    const originCode = normalizeAirportCode(input.origin);
    const destCode = normalizeAirportCode(input.destination);
    const originIcao = iataToIcao(originCode);
    const destIcao = iataToIcao(destCode);
    
    if (!originIcao || !destIcao) {
      return { offers: [], status: "empty", message: `Could not map IATA codes to ICAO for OpenSky Network` };
    }
    
    const requestDate = new Date(date);
    const begin = Math.floor(requestDate.getTime() / 1000);
    const end = begin + 86400; // 24 hours
    
    const username = process.env.OPENSKY_USERNAME || "";
    const password = process.env.OPENSKY_PASSWORD || "";
    const auth = username && password ? `${username}:${password}` : "";
    
    const headers: HeadersInit = auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {};
    
    const cacheKey = `opensky:${originIcao}:${begin}`;
    const cached = getCached<FlightOffer[]>(cacheKey);
    if (cached) {
      return { offers: cached, status: "success", message: "OpenSky Network real flight data - fare unavailable" };
    }
    
    const url = `https://opensky-network.org/api/flights/departure?airport=${originIcao}&begin=${begin}&end=${end}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    
    if (!response.ok) {
      if (response.status === 429) {
        return { offers: [], status: "error", message: "OpenSky Network rate limit exceeded" };
      }
      return { offers: [], status: "error", message: `OpenSky HTTP ${response.status}` };
    }
    
    const flights = await response.json().catch(() => []);
    if (!Array.isArray(flights)) {
      return { offers: [], status: "empty", message: "No flights returned from OpenSky" };
    }
    
    const matchingFlights = flights.filter((f: JsonRecord) => {
      const estArrivalAirport = asString(f.estArrivalAirport);
      return estArrivalAirport === destIcao;
    });
    
    if (matchingFlights.length === 0) {
      return { offers: [], status: "empty", message: "No matching flights found in OpenSky data" };
    }
    
    const offers: FlightOffer[] = matchingFlights.slice(0, 10).map((f: JsonRecord, index: number) => {
      const icao24 = asString(f.icao24);
      const callsign = asString(f.callsign).trim();
      const firstSeen = asNumber(f.firstSeen);
      const lastSeen = asNumber(f.lastSeen);
      const departTime = firstSeen > 0 ? new Date(firstSeen * 1000).toISOString() : "Scheduled";
      const arriveTime = lastSeen > 0 ? new Date(lastSeen * 1000).toISOString() : "Scheduled";
      
      return {
        id: `opensky-${icao24}-${index}`,
        provider: "opensky" as const,
        airline: callsign || "Unknown carrier",
        airlineCode: callsign.substring(0, 3),
        route: `${originCode} → ${destCode}`,
        origin: input.origin,
        destination: input.destination,
        depart: departTime,
        arrive: arriveTime,
        stops: 0,
        price: null,
        currency: "USD",
        scheduleOnly: true
      };
    });
    
    setCache(cacheKey, offers, 600000); // 10 min cache
    
    return { 
      offers, 
      status: "success", 
      message: "OpenSky Network real flight data - fare unavailable" 
    };
  } catch (error) {
    return { offers: [], status: "error", message: `OpenSky error: ${error instanceof Error ? error.message : String(error)}` };
  }
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

async function rapidAirport(query: string, headers: HeadersInit, originalIataCode?: string): Promise<{ skyId: string; entityId: string } | null> {
  const cacheKey = `rapidapi:airport:${query}:${originalIataCode || ""}`;
  const cached = getCached<{ skyId: string; entityId: string }>(cacheKey);
  if (cached) return cached;

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
    
    // The IATA code we're trying to match (from originalIataCode or query itself)
    const targetIataCode = (originalIataCode || query).toUpperCase();
    
    // Find exact match by IATA code in skyId or relevantFlightParams.skyId
    // Prefer AIRPORT type over CITY type
    let airportMatch: unknown = null;
    let cityMatch: unknown = null;
    
    for (const item of data) {
      const record = asRecord(item);
      const navigation = asRecord(record.navigation);
      const relevantFlightParams = asRecord(navigation.relevantFlightParams);
      
      const skyId = asString(record.skyId) || asString(relevantFlightParams.skyId);
      const flightPlaceType = asString(record.flightPlaceType);
      
      if (skyId.toUpperCase() === targetIataCode) {
        if (flightPlaceType === "AIRPORT") {
          airportMatch = item;
          break;
        } else if (!cityMatch) {
          cityMatch = item;
        }
      }
    }
    
    const bestMatch = airportMatch || cityMatch;
    
    if (!bestMatch) {
      // No exact IATA code match found
      console.warn("rapidapi_airport_no_exact_match", { query, targetIataCode, dataCount: data.length });
      return null;
    }
    
    const airport = asRecord(bestMatch);
    const navigation = asRecord(airport.navigation);
    const relevantFlightParams = asRecord(navigation.relevantFlightParams);
    
    // Check multiple possible locations for skyId and entityId
    const skyId = asString(airport.skyId) || asString(relevantFlightParams.skyId);
    const entityId = asString(navigation.entityId) || asString(relevantFlightParams.entityId);
    
    if (!skyId || !entityId) return null;
    
    console.info("rapidapi_airport_resolved", { query, skyId, entityId, flightPlaceType: asString(airport.flightPlaceType) });
    const result = { skyId, entityId };
    setCache(cacheKey, result, 600000); // 10 min cache
    return result;
  } catch (error) {
    throw error;
  }
}

async function searchRapidApi(input: SearchInput, date: string): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return { offers: [], status: "disabled", message: "RAPIDAPI_KEY not configured" };
  
  try {
    const headers = { "x-rapidapi-key": key, "x-rapidapi-host": "sky-scrapper.p.rapidapi.com" };
    
    const originCode = normalizeAirportCode(input.origin);
    const destCode = normalizeAirportCode(input.destination);
    
    let origin = await rapidAirport(originCode, headers);
    let destination = await rapidAirport(destCode, headers);
    
    // Retry with city name if no exact match found
    if (!origin) {
      const cityNameMap: Record<string, string> = {
        "LOS": "Lagos",
        "JFK": "New York",
        "NYC": "New York",
        "LAX": "Los Angeles",
        "LON": "London",
        "PAR": "Paris"
      };
      const cityName = cityNameMap[originCode] || Object.entries(CITY_TO_IATA).find(([, code]) => code === originCode)?.[0];
      if (cityName) {
        console.info("rapidapi_airport_retry_city_name", { code: originCode, cityName });
        origin = await rapidAirport(cityName, headers, originCode);
      }
    }
    
    if (!destination) {
      const cityNameMap: Record<string, string> = {
        "LOS": "Lagos",
        "JFK": "New York",
        "NYC": "New York",
        "LAX": "Los Angeles",
        "LON": "London",
        "PAR": "Paris"
      };
      const cityName = cityNameMap[destCode] || Object.entries(CITY_TO_IATA).find(([, code]) => code === destCode)?.[0];
      if (cityName) {
        console.info("rapidapi_airport_retry_city_name", { code: destCode, cityName });
        destination = await rapidAirport(cityName, headers, destCode);
      }
    }
    
    if (!origin || !destination) {
      const missingParts: string[] = [];
      if (!origin) missingParts.push(`origin ${originCode}`);
      if (!destination) missingParts.push(`destination ${destCode}`);
      return { 
        offers: [], 
        status: "error", 
        message: `Could not resolve airport codes for ${missingParts.join(" and ")}. Origin: ${origin ? origin.skyId + "/" + origin.entityId : "not found"}, Destination: ${destination ? destination.skyId + "/" + destination.entityId : "not found"}` 
      };
    }
    
    const v1Params = new URLSearchParams({
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
    
    const searchCacheKey = `rapidapi:search:${originCode}:${destCode}:${date}`;
    const cachedSearch = getCached<{ offers: FlightOffer[]; status: string; message?: string }>(searchCacheKey);
    if (cachedSearch) return cachedSearch;

    let body: JsonRecord | null = null;
    let statusValue: string | boolean = false;
    let sessionId: string | null = null;
    let retries = 0;
    const maxRetries = 6;
    
    // Try v1 endpoint with polling
    const v1Response = await fetch(`https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchFlights?${v1Params}`, { headers, cache: "no-store" });
    
    if (v1Response.status === 429) {
      return { offers: [], status: "error", message: "RapidAPI quota/rate limit exceeded (429)" };
    }
    
    if (v1Response.status === 403) {
      const errorBody = await v1Response.json().catch(() => ({}));
      const errorMsg = asString(asRecord(errorBody).message, "Not subscribed to this endpoint");
      return { offers: [], status: "error", message: `RapidAPI HTTP 403: ${errorMsg}` };
    }
    
    if (!v1Response.ok) {
      const errorBody = await v1Response.json().catch(() => ({}));
      const errorMsg = asString(asRecord(errorBody).message, v1Response.statusText);
      const trimmedBody = JSON.stringify(errorBody).slice(0, 300);
      console.error("rapidapi_v1_error", { status: v1Response.status, error: errorMsg, body: trimmedBody });
      
      // Fall back to searchFlightsComplete only for non-quota errors
      if (v1Response.status !== 429 && v1Response.status !== 403) {
        console.info("rapidapi_fallback_to_v2_complete", { v1Status: v1Response.status });
        const v2Params = new URLSearchParams({
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
        const v2Response = await fetch(`https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlightsComplete?${v2Params}`, { headers, cache: "no-store" });
        
        if (!v2Response.ok) {
          const v2ErrorBody = await v2Response.json().catch(() => ({}));
          const v2ErrorMsg = asString(asRecord(v2ErrorBody).message, v2Response.statusText);
          return { offers: [], status: "error", message: `RapidAPI v1 and v2 both failed. v1: ${errorMsg}, v2: ${v2ErrorMsg}` };
        }
        
        body = asRecord(await v2Response.json().catch(() => ({})));
      } else {
        return { offers: [], status: "error", message: `RapidAPI HTTP ${v1Response.status}: ${errorMsg}` };
      }
    } else {
      body = asRecord(await v1Response.json().catch(() => ({})));
    }
    
    const data = asRecord(body.data);
    const context = asRecord(data.context);
    statusValue = (context.status !== undefined ? context.status : body.status) as string | boolean;
    sessionId = asString(context.sessionId) || null;
    
    // Handle boolean status
    const statusString = typeof statusValue === "boolean" 
      ? (statusValue ? "complete" : "incomplete")
      : asString(statusValue, "unknown");
    
    const bodyMessage = asString(body.message).slice(0, 500);
    const contextStatusLog = asString(context.status);
    
    console.info("rapidapi_search_initial", { 
      bodyStatus: statusValue,
      bodyMessage: bodyMessage || "(none)",
      contextStatus: contextStatusLog || "(none)",
      sessionId: sessionId || "(none)"
    });
    
    // Poll searchIncomplete if status is incomplete and we have a sessionId
    while (statusString === "incomplete" && sessionId && retries < maxRetries) {
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s
      const backoffMs = Math.min(2000 * Math.pow(2, retries), 64000);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      retries++;
      
      const incompleteUrl = `https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchIncomplete?sessionId=${encodeURIComponent(sessionId)}`;
      const incompleteResponse = await fetch(incompleteUrl, { headers, cache: "no-store" });
      
      if (incompleteResponse.status === 429) {
        const retryAfter = incompleteResponse.headers.get("Retry-After");
        const retryWaitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffMs;
        console.warn("rapidapi_incomplete_rate_limited", { retry: retries, retryAfterMs: retryWaitMs });
        await new Promise(resolve => setTimeout(resolve, retryWaitMs));
        continue;
      }
      
      if (!incompleteResponse.ok) {
        console.warn("rapidapi_incomplete_poll_failed", { retry: retries, status: incompleteResponse.status });
        break;
      }
      
      body = asRecord(await incompleteResponse.json().catch(() => ({})));
      const polledData = asRecord(body.data);
      const polledContext = asRecord(polledData.context);
      statusValue = (polledContext.status !== undefined ? polledContext.status : body.status) as string | boolean;
      
      const polledStatusString = typeof statusValue === "boolean"
        ? (statusValue ? "complete" : "incomplete")
        : asString(statusValue, "unknown");
      
      if (polledStatusString === "complete") {
        console.info("rapidapi_search_completed", { retries, sessionId });
        break;
      }
    }
    
    if (!body) {
      return { offers: [], status: "error", message: `RapidAPI returned no body. Origin: ${origin.skyId}/${origin.entityId}, Destination: ${destination.skyId}/${destination.entityId}` };
    }
    
    const finalData = asRecord(body.data);
    const finalContext = asRecord(finalData.context);
    const finalStatus = typeof statusValue === "boolean"
      ? (statusValue ? "complete" : "incomplete")
      : asString(statusValue, "unknown");
    
    if (finalStatus === "incomplete") {
      return { offers: [], status: "error", message: `RapidAPI search incomplete after ${retries} retries. Status: ${finalStatus}, SessionId: ${sessionId || "none"}. Origin: ${origin.skyId}/${origin.entityId}, Destination: ${destination.skyId}/${destination.entityId}` };
    }
    
    const itineraries: unknown[] = Array.isArray(finalData.itineraries) ? finalData.itineraries : [];
    
    console.info("rapidapi_search_result", {
      contextStatus: asString(finalContext.status),
      itineraryCount: itineraries.length
    });
    
    const mapped = itineraries.map<FlightOffer>((raw, index) => {
      const itinerary = asRecord(raw);
      const legs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
      const leg = asRecord(legs[0]);
      const segments = Array.isArray(leg.segments) ? leg.segments : [];
      const segment = asRecord(segments[0]);
      const marketingCarriers: unknown[] = Array.isArray(asRecord(leg.carriers).marketing) ? asRecord(leg.carriers).marketing as unknown[] : [];
      const firstCarrier = asRecord(marketingCarriers[0]);
      const price = asRecord(itinerary.price);
      return {
        id: asString(itinerary.id, `rapid-${index}`),
        provider: "rapidapi" as const,
        airline: asString(firstCarrier.name, "Airline"),
        airlineCode: asString(firstCarrier.alternateId),
        route: `${normalizeAirportCode(input.origin)} → ${normalizeAirportCode(input.destination)}`,
        origin: input.origin,
        destination: input.destination,
        depart: asString(segment.departure, "Scheduled"),
        arrive: asString(segment.arrival, "Scheduled"),
        stops: Math.max(0, asNumber(leg.stopCount)),
        duration: asString(leg.durationInMinutes) ? `${asString(leg.durationInMinutes)} min` : undefined,
        price: asNumber(price.raw) || asNumber(price.formatted),
        currency: asString(price.currency, "USD")
      };
    }).filter((offer) => offer.price !== null && offer.price > 0);
    
    if (mapped.length === 0) {
      return { 
        offers: [], 
        status: "empty", 
        message: `No priced offers found. Context status: ${asString(finalContext.status)}, Itinerary count: ${itineraries.length}. Origin: ${origin.skyId}/${origin.entityId}, Destination: ${destination.skyId}/${destination.entityId}` 
      };
    }
    
    const result = { offers: mapped, status: "success" };
    setCache(searchCacheKey, result, 600000); // 10 min cache
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { offers: [], status: "error", message: `RapidAPI error: ${message}` };
  }
}

async function searchAviationstack(input: SearchInput, requestedDate?: string): Promise<{ offers: FlightOffer[]; status: string; message?: string }> {
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
        currency: "USD",
        scheduleOnly: true
      };
    }).filter((offer) => {
      if (!offer.airline || offer.airline.length === 0) return false;
      // Filter by date if requestedDate is provided
      if (requestedDate) {
        const departDate = offer.depart.slice(0, 10);
        return departDate === requestedDate;
      }
      return true;
    });
    
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
  const aviastackResult = await searchAviationstack(normalizedInput, date);
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

  // OpenSky Network fallback (real flight data, no pricing)
  const openskyResult = await searchOpenSky(normalizedInput, date);
  providerResults.push({ name: "opensky", status: openskyResult.status as "success" | "error" | "empty", message: openskyResult.message });
  if (openskyResult.offers.length > 0) {
    console.info("flight_provider_served", { provider: "opensky", count: openskyResult.offers.length, origin: normalizedInput.origin, destination: normalizedInput.destination });
    return {
      provider: "opensky",
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: openskyResult.offers,
      success: true,
      providers: providerResults,
      note: openskyResult.message
    };
  }

  // OpenFlights fallback (route database, no pricing)
  const openflightsResult = await searchOpenFlights(normalizedInput);
  providerResults.push({ name: "openflights", status: openflightsResult.status as "success" | "error" | "empty", message: openflightsResult.message });
  if (openflightsResult.offers.length > 0) {
    console.info("flight_provider_served", { provider: "openflights", count: openflightsResult.offers.length, origin: normalizedInput.origin, destination: normalizedInput.destination });
    return {
      provider: "openflights",
      origin: normalizedInput.origin,
      destination: normalizedInput.destination,
      date: input.date ?? null,
      dateUsed: date,
      options: openflightsResult.offers,
      success: true,
      providers: providerResults,
      note: openflightsResult.message
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
