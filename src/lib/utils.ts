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
    const f = (response as any)[name];
    (response as any)[name] = async () => {
      const result = await f.call(response);
      debugLog({ response: { id, [name]: result } });
      return result;
    };
  });
  return response;
}
