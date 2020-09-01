export function print(
  s: string,
  output: Deno.Writer = Deno.stdout,
): Promise<void> {
  return Deno.writeAll(output, new TextEncoder().encode(s));
}
