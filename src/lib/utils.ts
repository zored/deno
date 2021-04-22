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
    Object.keys(result).forEach((k: K): void => {
      result[k] = [...new Set(result[k])];
    });
  }
  return result;
}
