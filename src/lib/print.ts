export function print(
  s: string,
  output: Deno.Writer = Deno.stdout,
): Promise<number> {
  return output.write(new TextEncoder().encode(s));
}
