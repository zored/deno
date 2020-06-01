export function print(s: string): Promise<number> {
  return Deno.stdout.write(new TextEncoder().encode(s));
}
