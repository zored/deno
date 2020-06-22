import { ProxyRunner } from "./ProxyRunner.ts";
import { parse } from "../../../deps.ts";
import { CliSelect } from "../unstable-command.ts";
import { completionByArgs, IInfoTree } from "../shell-completion.ts";

export class ProxyRunnerFactory {
  fromFile = async (path: string, debug = false) =>
    new ProxyRunner(
      JSON.parse(await Deno.readTextFile(path)),
      debug,
    );
}

export const runShellProxyFromArgs = async (
  importMeta: ImportMeta,
  unstable = false,
) => {
  const parsedArgs = parse(
    Deno.args,
    {
      boolean: ["eval", "verbose"],
      string: ["merge", "config"],
      alias: {
        "eval": ["e"],
        "run": ["r"],
        "verbose": ["v"],
        "merge": ["m"],
        "config": ["c"],
        "dry-run": ["d"],
      },
    },
  );
  const {
    _,
    eval: isEval,
    run: isRun,
    verbose,
    config,
    merge,
    "dry-run": dry,
  } = parsedArgs;

  const runner = await new ProxyRunnerFactory().fromFile(
    config || "shell-proxy.json",
    verbose,
  );

  const getIds = () => runner.configs.getIds().sort();

  let [name, ...deepestArgs] = _;
  completionByArgs(
    importMeta,
    (info) =>
      info.fromTree(
        getIds().reduce((t, id) => {
          t[id] = null;
          return t;
        }, {} as IInfoTree),
      ),
    parsedArgs.completionFor || "sp",
    config ? `--config ${config}` : "",
    [name, ...deepestArgs],
  );
  if (!name && unstable) {
    const ids = getIds();
    name = await new CliSelect().select(ids, (_, i) => ids[i]);
  }

  return await runner.run(
    name + "",
    deepestArgs.map((a) => a + ""),
    isEval,
    isRun,
    merge ? JSON.parse(merge) : {},
    dry,
  );
};
