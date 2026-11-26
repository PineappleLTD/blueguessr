import { adminEnabled, passwordMatches, sameOrigin, startSession } from "@/lib/admin-auth";
import { clientKey, errorResponse, jsonError, underLimit } from "@/lib/contributions";

/** Body: {password}. Sets the admin session cookie. */
export async function POST(req: Request) {
  if (!adminEnabled()) return jsonError(404, "Admin is off");
  if (!sameOrigin(req)) return jsonError(403, "Wrong origin");
  try {
    if (!(await underLimit(`admin-login:${clientKey(req)}`, 8, 15 * 60))) {
      return jsonError(429, "Too many tries. Wait 15 minutes");
    }
    if (!(await underLimit("admin-login:all", 100, 15 * 60))) return jsonError(429, "Too many tries. Wait a bit");
  } catch (e) {
    return errorResponse(e, "admin login");
  }
  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown })?.password;
  } catch {
    return jsonError(400, "Bad request");
  }
  if (typeof password !== "string" || password.length > 200 || !passwordMatches(password)) {
    return jsonError(401, "Wrong password");
  }
  await startSession();
  return Response.json({ ok: true });
}
