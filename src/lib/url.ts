export type QueryObject = Record<string, string[] | string>;
export function parseQuery(o: QueryObject): string {
  return Object
    .entries(o)
    .flatMap(([k, vs]) =>
      (Array.isArray(vs) ? vs : [vs]).map((v) => `${k}=${v}`)
    )
    .join("&");
}
