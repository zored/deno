import { ProxyRunner } from "./ProxyRunner.ts";

const env = (name: string) => Deno.env.get(name);

const str = (n: string): string => env(n) || "";
const is = (n: string): boolean =>
  ["y", "1"].includes((env(n) + "").toLowerCase());

export class ProxyRunnerFactory {
  fromEnv = async (separator: string) => (await this.fromFile(
    str("file"),
    is("debug"),
  ));

  private fromFile = async (path: string, debug = false) =>
    new ProxyRunner(
      JSON.parse(await Deno.readTextFile(path)),
      debug,
    );
}

export const runFromEnv = async (separator: string) => {
  const argsStart = separator === "" ? 0 : Deno.args.indexOf(separator) + 1;
  const lastProxyArgs = Deno.args.slice(argsStart);
  const params = JSON.parse(env("params") || "{}");

  return (await new ProxyRunnerFactory().fromEnv(separator)).run(
    str("name"),
    lastProxyArgs,
    str("namespace"),
    is("eval"),
    params,
    is("debug"),
  );
};
