import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { jsonError } from "./contributions";

/**
 * Admin sign-in for the review page. One shared password (ADMIN_PASSWORD); no password set
 * means admin is off entirely. A successful sign-in gets an HttpOnly, SameSite=Strict cookie
 * holding an expiry and an HMAC signature keyed off the password, so changing the password
 * signs everyone out.
 */

const PROD = process.env.NODE_ENV === "production";
/** `__Host-` pins the cookie to this exact host over HTTPS. It needs Secure, so production only. */
const COOKIE = PROD ? "__Host-bg-admin" : "bg-admin";
export const SESSION_SECONDS = 12 * 60 * 60;

const password = () => process.env.ADMIN_PASSWORD || null;

export const adminEnabled = () => password() !== null;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check: both sides are hashed first so their lengths always match. */
export function passwordMatches(input: string): boolean {
  const pw = password();
  if (!pw) return false;
  return timingSafeEqual(sha256(`pw:${input}`), sha256(`pw:${pw}`));
}

function signature(payload: string, pw: string): Buffer {
  const key = sha256(`blueguessr:admin-session:${pw}`);
  return createHmac("sha256", key).update(payload).digest();
}

function newSessionValue(pw: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${exp}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${signature(payload, pw).toString("base64url")}`;
}

function validSession(value: string | undefined): boolean {
  const pw = password();
  if (!pw || !value) return false;
  const [exp, nonce, sig, ...rest] = value.split(".");
  if (!exp || !nonce || !sig || rest.length) return false;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < Date.now()) return false;
  const given = Buffer.from(sig, "base64url");
  const expected = signature(`${exp}.${nonce}`, pw);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** True when the request carries a valid admin session. Reads cookies, so it's request-time. */
export async function isAdmin(): Promise<boolean> {
  return validSession((await cookies()).get(COOKIE)?.value);
}

const cookieOptions = {
  httpOnly: true,
  secure: PROD,
  sameSite: "strict",
  path: "/",
} as const;

export async function startSession(): Promise<void> {
  const pw = password();
  if (!pw) return;
  (await cookies()).set(COOKIE, newSessionValue(pw), { ...cookieOptions, maxAge: SESSION_SECONDS });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

/** Rejects cross-site requests that carry an Origin from another host (belt and braces with SameSite). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return [req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host].includes(host);
}

/**
 * Guard for every admin API route: returns an error response to send back, or null when the
 * caller is a signed-in admin.
 */
export async function adminGuard(req: Request): Promise<Response | null> {
  if (!adminEnabled()) return jsonError(404, "Admin is off");
  if (!sameOrigin(req)) return jsonError(403, "Wrong origin");
  if (!(await isAdmin())) return jsonError(401, "Sign in first");
  return null;
}
