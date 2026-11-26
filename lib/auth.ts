import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

/** Google sign-in only works once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. */
export const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Accounts are optional: they only carry a player's identity (lib/accounts.ts) across devices.
 * No database: the session is an encrypted cookie, and the account -> player link lives in KV.
 * BETTER_AUTH_URL is set in production; elsewhere the base URL comes from the request.
 */
export const auth = betterAuth({
  appName: "BlueGuessr",
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  session: {
    expiresIn: THIRTY_DAYS,
    cookieCache: { enabled: true, strategy: "jwe", refreshCache: true, maxAge: THIRTY_DAYS },
  },
  plugins: [nextCookies()],
});
