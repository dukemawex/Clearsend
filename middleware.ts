import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "cs_uid";
const valid = (v?: string) => !!v && /^[a-f0-9]{32}$/.test(v);

/** Issue each browser an anonymous, unguessable owner id (128-bit) and pass it to handlers in x-cs-uid. */
export function middleware(req: NextRequest) {
  let uid = req.cookies.get(COOKIE)?.value;
  const fresh = !valid(uid);
  if (fresh) uid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const headers = new Headers(req.headers);
  headers.set("x-cs-uid", uid!); // always overwrite: a client-sent x-cs-uid is ignored
  const res = NextResponse.next({ request: { headers } });
  if (fresh) res.cookies.set(COOKIE, uid!, { httpOnly: true, secure: process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/telegram|api/webhooks).*)"] };
