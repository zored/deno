import { chunk } from "../../deps.ts";
import { print } from "./print.ts";

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
    console.error(
      JSON.stringify(
        typeof debugLog === "function" ? debugLog() : debugLog,
        null,
        " ",
      ),
    );
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

export function withProgress(
  f: () => Promise<{ done: boolean; percentInt: number }>,
): () => Promise<boolean> {
  let dotsAmount = 1;
  const dotsLimit = 3;
  return async () => {
    const { done, percentInt } = await f();
    await print(`\r`, Deno.stderr);
    if (done) {
      return true;
    }
    const dots = ".".repeat(dotsAmount) + " ".repeat(dotsLimit - dotsAmount);
    if ((++dotsAmount) > dotsLimit) {
      dotsAmount = 1;
    }
    const label = percentInt > 100
      ? "exceeding"
      : (percentInt <= 0 ? "starting" : `${percentInt}%`);
    await print(`Progress: ${label}${dots}`, Deno.stderr);
    return false;
  };
}

export async function wait(
  done: () => Promise<boolean>,
  timeMs = 1000,
  attempts = Infinity,
): Promise<void> {
  if (await done()) {
    return;
  }
  await sleepMs(timeMs);

  if (attempts <= 1) {
    return;
  }
  await wait(done, timeMs, attempts - 1);
}

export interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export class BasicAuthFetcher implements Fetcher {
  constructor(
    private cookiePath: string,
    private login: string,
    private passwordArgument = "p",
  ) {
  }

  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    init = init || {};
    const h = init.headers = init.headers || {};
    Object.entries(this.getHeaders()).forEach(([k, v]) => {
      if (h instanceof Headers) {
        h.set(k, v);
      } else {
        (h as any)[k] = v;
      }
    });
    Object.assign(init.headers);
    const response = await myFetch(input, init);
    this.saveCookie(response.headers.get("set-cookie") || "");
    return response;
  }

  private getPassword(): string {
    const prefix = `--${this.passwordArgument}=`;
    const argument = Deno.args.find((a) => a.startsWith(prefix));
    if (!argument) {
      throw new Error(
        `Specify password as '${prefix}$(read -s -p "${this.passwordArgument} password: " a && echo $a)'`,
      );
    }
    return argument.substring(prefix.length);
  }

  private getCookie() {
    return existsSync(this.cookiePath)
      ? Deno.readTextFileSync(this.cookiePath)
      : "";
  }

  private saveCookie(cookie: string) {
    if (cookie.trim().length) {
      Deno.writeTextFileSync(this.cookiePath, cookie);
    }
  }

  private getHeaders(): HeadersInit {
    let password: string | null;
    try {
      password = this.getPassword();
    } catch (e) {
      password = null;
    }

    if (password === null) {
      const cookie = this.getCookie();
      const matches = cookie.match(/.*(pAuth=.+?);|$/);
      if (matches) {
        return { Cookie: matches[1] };
      }
    }

    return {
      Authorization: "Basic " + btoa(`${this.login}:${password}`),
    };
  }
}

export function parseJson(v: string) {
  try {
    return JSON.parse(v);
  } catch (e) {
    debugLog({ invalidJson: v });
    throw new Error(
      `Parse JSON error:\n${v.substring(0, 200)}...\n\n${e.message}`,
    );
  }
}

export function logJson(json: any, pretty = false) {
  console.log(pretty ? JSON.stringify(json, null, " ") : JSON.stringify(json));
}
