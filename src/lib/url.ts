export type QueryObject = Record<string, string[] | string | undefined>;

export function parseQuery(o: QueryObject): string {
  return Object
    .entries(o)
    .filter(([, vs]) => vs !== undefined)
    .flatMap(([k, vs]) =>
      (Array.isArray(vs) ? vs : [vs]).map((v) => `${k}=${v}`)
    )
    .join("&");
}
