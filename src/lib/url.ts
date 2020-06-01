export function parseQuery(o: Record<string, string[]>): string {
  return Object
    .entries(o)
    .flatMap(([k, vs]) => vs.map((v) => `${k}=${v}`))
    .join("&");
}
