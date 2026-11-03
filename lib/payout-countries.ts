// PayPal Payouts recipient eligibility. Source (read 2026-11-03, "Last updated: September 10, 2026"):
// https://developer.paypal.com/docs/payouts/standard/reference/country-feature/
// Payouts go to a PayPal (or US Venmo) ACCOUNT, never directly to a local bank. Recipients withdraw from PayPal
// to their bank where PayPal supports it. Unclaimed payouts (no PayPal account for the email/phone) are returned
// to the sender after 30 days (same page).

/** Countries listed as eligible to receive payouts. Not listed => unsupported (e.g. NG, GH are NOT on the list). */
export const PAYOUT_COUNTRIES: Record<string, string> = {
  AD: "Andorra", AR: "Argentina", AU: "Australia", AT: "Austria", BS: "Bahamas", BH: "Bahrain", BE: "Belgium", BM: "Bermuda", BW: "Botswana", BR: "Brazil", BG: "Bulgaria", CA: "Canada", KY: "Cayman Islands", CL: "Chile", C2: "China", CO: "Colombia", CR: "Costa Rica", HR: "Croatia", CY: "Cyprus", CZ: "Czech Republic", DK: "Denmark", DO: "Dominican Republic", EC: "Ecuador", SV: "El Salvador", EE: "Estonia", FO: "Faroe Islands", FI: "Finland", FR: "France", GE: "Georgia", DE: "Germany", GI: "Gibraltar", GR: "Greece", GL: "Greenland", GT: "Guatemala", HN: "Honduras", HK: "Hong Kong SAR China", HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica", JP: "Japan", JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", KW: "Kuwait", LV: "Latvia", LS: "Lesotho", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg", MY: "Malaysia", MT: "Malta", MU: "Mauritius", MX: "Mexico", MD: "Moldova", MC: "Monaco", MA: "Morocco", MZ: "Mozambique", NL: "Netherlands", NZ: "New Zealand", NI: "Nicaragua", NO: "Norway", OM: "Oman", PA: "Panama", PE: "Peru", PH: "Philippines", PL: "Poland", PT: "Portugal", QA: "Qatar", RE: "Réunion", RO: "Romania", SM: "San Marino", SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia", SG: "Singapore", SK: "Slovakia", SI: "Slovenia", ZA: "South Africa", ES: "Spain", SE: "Sweden", CH: "Switzerland", TR: "Turkey", AE: "United Arab Emirates", GB: "United Kingdom", US: "United States", UY: "Uruguay", VE: "Venezuela", VN: "Vietnam",
};

/** Currencies PayPal auto-converts on payout (same source, "Supported currencies for automatic conversion"). Escrow/payout currency must be one of these. */
export const PAYOUT_CURRENCIES = ["AUD", "CAD", "EUR", "MXN", "GBP", "USD", "CHF", "SEK", "PLN", "NOK", "HUF", "DKK", "CZK", "ILS", "HKD", "NZD", "IDR", "PHP", "JPY", "SGD"] as const;

/** Listed countries where currency conversion is NOT available; source says send USD there (Caribbean / Latin America) or match account currency. */
export const NO_CONVERSION = new Set(["C2", "IN", "TR", "BS", "BM", "KY", "JM", "AR", "CL", "CO", "CR", "DO", "EC", "SV", "GT", "HN", "NI", "PA", "PE", "UY", "VE"]);

export const RecipientTypes = ["EMAIL", "PHONE", "PAYPAL_ID"] as const;
export type RecipientType = (typeof RecipientTypes)[number];

export type PayoutCheck = { ok: true; warnings: string[] } | { ok: false; error: string };

export function checkPayoutEligibility(country: string, currency: string): PayoutCheck {
  const c = country.trim().toUpperCase(); const cur = currency.trim().toUpperCase();
  if (!PAYOUT_COUNTRIES[c]) return { ok: false, error: `PayPal Payouts doesn't list ${c} as a country that can receive payouts, so ClearSend can't release to a recipient there. Use a recipient PayPal account registered in a supported country (see PayPal's Payouts country list).` };
  if (!(PAYOUT_CURRENCIES as readonly string[]).includes(cur)) return { ok: false, error: `${cur} isn't a PayPal Payouts currency. Use one of: ${PAYOUT_CURRENCIES.join(", ")}.` };
  const warnings: string[] = [];
  if (NO_CONVERSION.has(c) && cur !== "USD") return { ok: false, error: `PayPal doesn't convert payout currency for ${PAYOUT_COUNTRIES[c]}. Send in USD instead.` };
  if (c === "BR" || c === "MY") warnings.push(`${PAYOUT_COUNTRIES[c]} has PayPal currency restrictions; conversion may apply.`);
  warnings.push("PayPal pays into the recipient's PayPal account; they withdraw to their local bank from PayPal. PayPal's conversion includes its own spread.");
  return { ok: true, warnings };
}

export function validateRecipientId(type: RecipientType, value: string): string | null {
  if (type === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Enter a valid PayPal email.";
  if (type === "PHONE") return /^\+?[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, "")) ? null : "Enter the phone in international format, e.g. +254712345678.";
  return /^[A-Z0-9]{13}$/.test(value) ? null : "A PayPal payer ID is 13 letters/digits.";
}
