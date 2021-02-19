import { green, parse } from "../../../deps.ts";
import { IRunner, Runner, sh } from "../command.ts";
import type { ProxyHandler } from "./ProxyHandler.ts";
import { SSHHandler } from "./ProxyHandler/SSHHandler.ts";
import { DockerHandler } from "./ProxyHandler/DockerHandler.ts";
import { MongoHandler } from "./ProxyHandler/MongoHandler.ts";
import { ScreenHandler } from "./ProxyHandler/ScreenHandler.ts";
import { K8SHandler } from "./ProxyHandler/K8SHandler.ts";
import type { ProxyConfig, ProxyConfigs } from "./ProxyConfigs.ts";
import { ProxyConfigTree } from "./ProxyConfigTree.ts";
import { CommandBuilder } from "./CommandBuilder.ts";
import { PostgresHandler } from "./ProxyHandler/PostgresHandler.ts";

export type Params = Record<string, any>;
export type ShCommands = string[];
export type ExecSubCommand = (command: ShCommands) => Promise<string>;

export type RunResult = ShCommands | string | undefined;

export class ProxyRunner {
  public readonly configs: ProxyConfigTree;
  private readonly handlers: ProxyHandler<any>[] = [
    new SSHHandler(),
    new DockerHandler(),
    new MongoHandler(),
    new PostgresHandler(),
    new ScreenHandler(),
    new K8SHandler(),
  ];

  constructor(
    configs: ProxyConfigs,
    private readonly debug = false,
    private readonly retrieveOutput = false,
    handlers: ProxyHandler<any>[] = [],
    private shRunner: IRunner = new Runner(),
  ) {
    this.configs = new ProxyConfigTree(configs);
    handlers.forEach((h) => this.handlers.push(h));
  }

  run = async (
    id: string = "default",
    lastArgs: ShCommands = [],
    isEval: boolean = true,
    isRun: boolean = false,
    params: Params = {},
    dry: boolean = false,
  ): Promise<RunResult> => {
    if (isRun) {
      const runs = this.configs.getRunsById(id);
      if (runs.length !== 1) {
        throw new Error(
          `Found ${runs.length} runs '${id}': ${JSON.stringify(runs)}`,
        );
      }

      const [[, rawRunCommand]] = runs;

      const stringRunCommand = Array.isArray(rawRunCommand)
        ? rawRunCommand.join(" && ")
        : rawRunCommand;

      const runCommandWithArgs = Object
        .entries(parse(lastArgs))
        .filter(([n]) => n !== "_")
        .reduce(
          (c, [name, value]) =>
            c.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), value),
          stringRunCommand,
        );

      const commands: ShCommands = ["/bin/sh", "-c", runCommandWithArgs];
      return this.handleCommands(new CommandBuilder([commands]), dry);
    }

    const configs = this.configs.getBranch(id);
    if (!configs.length) {
      console.log(`No proxies for '${id}'.`);
      throw new Error(
        `No proxy branch found for path '${id}'. Possible options are:${
          this.configs.getIds().sort().map((i) => `\n${i}`).join("")
        }`,
      );
    }

    const commands = new CommandBuilder();
    const exec = async (cs: ShCommands) =>
      cs.length === 0 ? "" : await this.exec(commands.with(cs));
    for (let i in configs) {
      const config = configs[i];
      const isLast = parseInt(i) === configs.length - 1;
      const proxyCommands = await this.createProxyCommands(
        config,
        params,
        exec,
        isLast,
      );
      if (proxyCommands === null) {
        return undefined;
      }
      commands.add(proxyCommands);
    }

    commands.add(
      await this.getLastProxyCommands(configs, isEval, lastArgs, exec, params),
    );

    return await this.handleCommands(commands, dry);
  };

  private async handleCommands(commands: CommandBuilder, dry: boolean) {
    if (dry) {
      this.log(commands, true);
      return commands.toArray();
    }
    return await this.execOrTty(commands);
  }

  private getLastProxyCommands = async (
    configs: ProxyConfig[],
    isEval: boolean,
    lastProxyArgs: ShCommands,
    exec: ExecSubCommand,
    params: Params,
  ) => {
    const [config] = configs.slice(-1);
    const handler = this.getHandler(config);
    return (await Promise.all(
      (
        isEval
          ? await handler.getEval(lastProxyArgs, config, exec)
          : handler.getTty(config).concat(lastProxyArgs)
      ).flatMap((a) => this.enrichArgument(a, config, params, exec)),
    )).flat().map((a) => configs.length > 1 ? `'${a}'` : a);
  };

  private exec = async (cs: CommandBuilder) => {
    this.log(cs);
    return await this.shRunner.output(cs.toArray());
  };

  private tty = async (cs: CommandBuilder) => {
    this.log(cs);
    const csa = cs.toArray();
    await sh(csa);
    return csa;
  };

  private execOrTty = async (cs: CommandBuilder) =>
    this.retrieveOutput ? this.exec(cs) : this.tty(cs);

  private log(cs: CommandBuilder, force = false) {
    if (force || this.debug) {
      console.error(green(cs.toString()));
    }
  }

  private createProxyCommands = async (
    config: ProxyConfig,
    params: Params,
    exec: ExecSubCommand,
    isLast: boolean,
  ): Promise<ShCommands | null> => {
    const handler = this.getHandler(config);
    const done = await handler.handleParams(config, params, exec);
    if (done) {
      return null;
    }
    return handler.getChainBase(config, isLast);
  };

  private enrichArgument = async (
    a: string,
    c: ProxyConfig,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<string[]> =>
    await this.getHandler(c).enrichArgument(a, c, params, exec);

  private getHandler(c: ProxyConfig): ProxyHandler<any> {
    const handler = this.handlers.find((h: ProxyHandler<any>) => h.suits(c));
    if (!handler) {
      throw new Error(`No handler found for proxy: ${JSON.stringify(c)}`);
    }
    return handler;
  }
}
