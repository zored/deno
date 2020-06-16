import { ProxyRunner } from "./ProxyRunner.ts";
import { parse } from "../../../deps.ts";
import { CliSelect } from "../unstable-command.ts";

export class ProxyRunnerFactory {
  fromFile = async (path: string, debug = false) =>
    new ProxyRunner(
      JSON.parse(await Deno.readTextFile(path)),
      debug,
    );
}

export const runShellProxyFromArgs = async (unstable = false) => {
  const {
    _,
    eval: isEval,
    verbose,
    config,
    merge,
    "dry-run": dry,
  } = parse(
    Deno.args,
    {
      boolean: ["eval", "verbose"],
      string: ["merge", "config"],
      alias: {
        "eval": ["e"],
        "verbose": ["v"],
        "merge": ["m"],
        "config": ["c"],
        "dry-run": ["d"],
      },
    },
  );

  let [name, ...deepestArgs] = _;

  const runner = await new ProxyRunnerFactory().fromFile(
    config || "shell-proxy.json",
    verbose,
  );

  if (!name && unstable) {
    const ids = runner.configs.getIds().sort();
    name = await new CliSelect().select(ids, (_, i) => ids[i]);
  }

  return await runner.run(
    name + "",
    deepestArgs.map((a) => a + ""),
    isEval,
    merge ? JSON.parse(merge) : {},
    dry,
  );
};
