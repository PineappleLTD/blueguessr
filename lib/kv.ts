import "server-only";
import { Redis } from "@upstash/redis";

/**
 * The small key-value surface the game needs (rooms, games, leaderboard, accounts).
 *
 * Production uses Upstash Redis from the Vercel Marketplace (KV_REST_API_URL / KV_REST_API_TOKEN,
 * or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Local development without those
 * variables falls back to an in-process store so the game still runs on one machine;
 * production refuses to start without Redis.
 *
 * Values are JSON: pass objects, get objects back.
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already existed. */
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;

  hset(key: string, field: string, value: unknown): Promise<void>;
  /** Returns false when the field already existed. */
  hsetnx(key: string, field: string, value: unknown): Promise<boolean>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hdel(key: string, field: string): Promise<void>;

  /** With `gt`, only raises an existing member's score. */
  zadd(key: string, score: number, member: string, opts?: { gt?: boolean }): Promise<void>;
  /** Highest first. `stop` is inclusive, like Redis. */
  zrevrange(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]>;
  zscore(key: string, member: string): Promise<number | null>;
  /** 0-based rank, highest score first. */
  zrevrank(key: string, member: string): Promise<number | null>;
  zcard(key: string): Promise<number>;

  lpush(key: string, value: unknown): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  /** Removes list items deep-equal to `value`. */
  lrem(key: string, value: unknown): Promise<void>;
}

function redisKV(redis: Redis): KV {
  return {
    get: (k) => redis.get(k),
    async set(k, v, o) {
      const opts = o?.ex ? (o.nx ? { ex: o.ex, nx: true as const } : { ex: o.ex }) : o?.nx ? { nx: true as const } : undefined;
      // Upstash returns null when NX blocked the write.
      return (await redis.set(k, v, opts)) !== null;
    },
    async del(...k) {
      if (k.length) await redis.del(...k);
    },
    incr: (k) => redis.incr(k),
    async expire(k, s) {
      await redis.expire(k, s);
    },
    async hset(k, f, v) {
      await redis.hset(k, { [f]: v });
    },
    async hsetnx(k, f, v) {
      return (await redis.hsetnx(k, f, v)) === 1;
    },
    hget: (k, f) => redis.hget(k, f),
    async hgetall<T>(k: string) {
      return ((await redis.hgetall<Record<string, T>>(k)) ?? {}) as Record<string, T>;
    },
    async hdel(k, f) {
      await redis.hdel(k, f);
    },
    async zadd(k, score, member, o) {
      if (o?.gt) await redis.zadd(k, { gt: true }, { score, member });
      else await redis.zadd(k, { score, member });
    },
    async zrevrange(k, start, stop) {
      const flat = await redis.zrange<(string | number)[]>(k, start, stop, { rev: true, withScores: true });
      const out: { member: string; score: number }[] = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
      return out;
    },
    zscore: (k, m) => redis.zscore(k, m),
    zrevrank: (k, m) => redis.zrevrank(k, m),
    zcard: (k) => redis.zcard(k),
    async lpush(k, v) {
      await redis.lpush(k, v);
    },
    lrange: (k, a, b) => redis.lrange(k, a, b),
    async lrem(k, v) {
      await redis.lrem(k, 0, v);
    },
  };
}

// ---------- local development fallback ----------

type Entry = { v: unknown; exp?: number };

function memoryKV(): KV {
  const g = globalThis as unknown as { __blueguessrKV?: Map<string, Entry> };
  const store = (g.__blueguessrKV ??= new Map());
  const now = () => Date.now();
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  const live = (k: string) => {
    const e = store.get(k);
    if (!e) return undefined;
    if (e.exp && e.exp < now()) {
      store.delete(k);
      return undefined;
    }
    return e;
  };
  const getAs = <T>(k: string, init: () => T): T => {
    const e = live(k);
    if (e) return e.v as T;
    const v = init();
    store.set(k, { v });
    return v;
  };
  const hash = (k: string) => getAs<Record<string, unknown>>(k, () => ({}));
  const zset = (k: string) => getAs<Map<string, number>>(k, () => new Map());
  const list = (k: string) => getAs<unknown[]>(k, () => []);
  const sortedDesc = (k: string) => [...zset(k).entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const slice = <T>(arr: T[], start: number, stop: number) => {
    const n = arr.length;
    const s = start < 0 ? Math.max(0, n + start) : start;
    const e = stop < 0 ? n + stop : stop;
    return arr.slice(s, e + 1);
  };

  return {
    async get(k) {
      return clone((live(k)?.v ?? null) as never);
    },
    async set(k, v, o) {
      if (o?.nx && live(k)) return false;
      store.set(k, { v: clone(v), exp: o?.ex ? now() + o.ex * 1000 : undefined });
      return true;
    },
    async del(...ks) {
      ks.forEach((k) => store.delete(k));
    },
    async incr(k) {
      const e = live(k);
      const n = (Number(e?.v) || 0) + 1;
      store.set(k, { v: n, exp: e?.exp });
      return n;
    },
    async expire(k, s) {
      const e = live(k);
      if (e) e.exp = now() + s * 1000;
    },
    async hset(k, f, v) {
      hash(k)[f] = clone(v);
    },
    async hsetnx(k, f, v) {
      const h = hash(k);
      if (f in h) return false;
      h[f] = clone(v);
      return true;
    },
    async hget(k, f) {
      return clone((hash(k)[f] ?? null) as never);
    },
    async hgetall(k) {
      return clone(hash(k)) as never;
    },
    async hdel(k, f) {
      delete hash(k)[f];
    },
    async zadd(k, score, member, o) {
      const z = zset(k);
      const cur = z.get(member);
      if (o?.gt && cur !== undefined && cur >= score) return;
      z.set(member, score);
    },
    async zrevrange(k, start, stop) {
      return slice(sortedDesc(k), start, stop).map(([member, score]) => ({ member, score }));
    },
    async zscore(k, m) {
      return zset(k).get(m) ?? null;
    },
    async zrevrank(k, m) {
      const i = sortedDesc(k).findIndex(([x]) => x === m);
      return i < 0 ? null : i;
    },
    async zcard(k) {
      return zset(k).size;
    },
    async lpush(k, v) {
      list(k).unshift(clone(v));
    },
    async lrange(k, a, b) {
      return clone(slice(list(k), a, b)) as never;
    },
    async lrem(k, v) {
      const l = list(k);
      const s = JSON.stringify(v);
      for (let i = l.length - 1; i >= 0; i--) if (JSON.stringify(l[i]) === s) l.splice(i, 1);
    },
  };
}

let instance: KV | undefined;

export function kv(): KV {
  if (instance) return instance;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    instance = redisKV(new Redis({ url, token }));
  } else if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error(
      "Redis is not configured. Add Upstash Redis from the Vercel Marketplace (vercel integration add upstash).",
    );
  } else {
    console.warn("[blueguessr] KV_REST_API_URL not set: using the in-memory store (local development only).");
    instance = memoryKV();
  }
  return instance;
}
