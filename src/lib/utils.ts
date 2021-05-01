import { chunk } from "../../deps.ts";

export async function sleepMs(ms = 1) {
  return new Promise((r) => setTimeout(r, ms));
}

export function fromPairsArray<V, K extends string | number | symbol>(
  p: [K, V][],
  set = false,
): Record<K, V[]> {
  const result = p.reduce((r, [k, v]) => {
    const a = r[k] ?? [];
    a.push(v);
    r[k] = a;
    return r;
  }, {} as Record<K, V[]>);

  if (set) {
    Object.keys(result).forEach((k): void => {
      result[k as K] = [...new Set(result[k as K])];
    });
  }
  return result;
}

export function debugLog<T>(debugLog: T): T {
  if (Deno.args.includes("-v")) {
    console.error(JSON.stringify(debugLog));
  }
  return debugLog;
}

let requestId = 1;

export async function myFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  const id = requestId++;
  debugLog({ request: { id, input, init, response } });
  // monkey patch:
  ["text"].forEach((name) => {
    const r = response as any;
    const f = r[name];
    Object.defineProperty(r, name, { writable: true });
    r[name] = async () => {
      const result = await f.call(response);
      debugLog({ response: { id, [name]: result } });
      return result;
    };
  });
  return response;
}

export function existsSync(filename: string): boolean {
  try {
    Deno.statSync(filename);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    } else {
      throw error;
    }
  }
}

export async function promiseAllChunk<T>(
  a: Promise<T>[],
  { size = 5, delayMs = 0 } = {},
): Promise<T[]> {
  const result: T[] = [];
  const chunks = chunk(a, size, undefined) as T[][];
  for (const c of chunks) {
    (await Promise.all(c)).forEach((v) => result.push(v));
    await sleepMs(delayMs);
  }
  return result;
}

type Timestamp = number;

export class RateLimit {
  private runsTimestamps: Timestamp[] = [];
  constructor(
    private count = 20,
    private perMs = 10,
  ) {
  }

  async run() {
    const now = new Date().getTime();
    const edge = now - this.perMs;
    this.runsTimestamps = this.runsTimestamps.filter((v) => v > edge);

    if (this.runsTimestamps.length >= this.count) {
      const ms = now - this.runsTimestamps[this.count - 1] + 1;
      await sleepMs(ms);
      await this.run();
      return;
    }

    this.runsTimestamps.push(now);
  }
}
