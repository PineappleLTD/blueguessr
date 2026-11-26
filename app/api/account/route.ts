import { headers } from "next/headers";
import { linkAccount } from "@/lib/accounts";
import { auth, googleConfigured } from "@/lib/auth";

async function session() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

/** GET /api/account -> whether sign-in is available, and who is signed in. */
export async function GET() {
  const s = await session();
  return Response.json(
    {
      google: googleConfigured,
      user: s ? { name: s.user.name, image: s.user.image ?? null } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/account { playerId, name } -> { player } : links the signed-in account to this
 * device's player (first sign-in) or returns the player the account already has.
 */
export async function POST(request: Request) {
  const s = await session();
  if (!s) return Response.json({ error: "signed-out" }, { status: 401 });
  let body: { playerId?: unknown; name?: unknown } = {};
  try {
    body = await request.json();
  } catch {}
  try {
    const player = await linkAccount(s.user.email, s.user.name, { playerId: body.playerId, name: body.name });
    return Response.json({ player }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
}
