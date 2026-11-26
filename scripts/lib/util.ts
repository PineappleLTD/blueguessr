// Shared helpers for the photo pipeline scripts (run with tsx from the repo root).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT, "data");
export const CACHE_DIR = path.join(ROOT, ".cache");
export const PHOTOS_DIR = path.join(ROOT, "public", "photos");
export const PHOTOS_JSON = path.join(DATA_DIR, "photos.json");
export const REJECTED_JSON = path.join(DATA_DIR, "rejected.json");
export const CAMPUS_JSON = path.join(DATA_DIR, "campus.json");

/** Generic client name. Never put a person's name, email or the project name in requests. */
export const USER_AGENT = "campus-photo-fetcher/1.0";

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function readJson<T>(file: string, fallback?: T): T {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${path.relative(ROOT, file)}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** Write JSON via a temp file + rename so the target is never left half-written. */
export function writeJson(file: string, value: unknown, indent = 2): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, indent) + "\n");
  fs.renameSync(tmp, file);
}

export function cachePath(...parts: string[]): string {
  const file = path.join(CACHE_DIR, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** 12 random base36 characters from crypto, so ids and filenames carry no meaning. */
export function randomId(length = 12): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // 252 = 7 * 36: reject the tail so every character is equally likely.
      if (byte < 252 && out.length < length) out += alphabet[byte % 36];
    }
  }
  return out;
}

interface FetchOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  retries?: number;
  /** Label used in logs instead of the URL (URLs may carry tokens). */
  label?: string;
}

/** fetch with retries and backoff on 429/5xx and network errors. Honors Retry-After. */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 5;
  const label = opts.label ?? url;
  let wait = 2000;
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined;
    let error: unknown;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": USER_AGENT, ...opts.headers },
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      error = err;
    }
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (res && !retryable) return res;
    if (attempt >= retries) {
      if (res) return res;
      throw new Error(`${label}: ${String(error)}`);
    }
    const retryAfter = Number(res?.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : wait;
    console.warn(`  ${label}: ${res ? `HTTP ${res.status}` : String(error)}; retrying in ${Math.round(delay / 1000)}s`);
    await res?.body?.cancel().catch(() => {});
    await sleep(delay);
    wait = Math.min(wait * 2, 120_000);
  }
}

/** Return cached JSON if present, otherwise call `load` and cache what it returns. */
export async function cachedJson<T>(file: string, load: () => Promise<T>): Promise<T> {
  if (fs.existsSync(file)) return readJson<T>(file);
  const value = await load();
  writeJson(file, value, 0);
  return value;
}

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[m[1]] = value;
  }
  return out;
}

/** The main checkout's root when running inside a git worktree, else null. */
function mainCheckoutRoot(): string | null {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const root = path.dirname(common);
    return path.resolve(root) === ROOT ? null : root;
  } catch {
    return null;
  }
}

/** Read a setting from the environment, then .env.local here, then .env.local in the main checkout. */
export function getEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const candidates = [path.join(ROOT, ".env.local")];
  const main = mainCheckoutRoot();
  if (main) candidates.push(path.join(main, ".env.local"));
  for (const file of candidates) {
    const value = parseEnvFile(file)[name];
    if (value) return value;
  }
  return undefined;
}

/** Minimal `--flag value` / `--flag` parser. */
export function parseArgs(argv = process.argv.slice(2)): { flags: Record<string, string | true>; rest: string[] } {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      if (inline !== undefined) flags[key] = inline;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
      else flags[key] = true;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
