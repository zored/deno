import { ProxyRunner } from "./ProxyRunner.ts";

export class ProxyRunnerFactory {
  fromFile = async (path: string, debug = false) =>
    new ProxyRunner(
      JSON.parse(await Deno.readTextFile(path)),
      debug,
    );
}
