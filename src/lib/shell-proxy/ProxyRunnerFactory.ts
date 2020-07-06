import { ProxyRunner } from "./ProxyRunner.ts";

export class ProxyRunnerFactory {
  fromFile = async (
    path: string = "shell-proxy.json",
    debug = false,
    retrieveOutput = false,
  ) =>
    new ProxyRunner(
      JSON.parse(await Deno.readTextFile(path)),
      debug,
      retrieveOutput,
    );
}
