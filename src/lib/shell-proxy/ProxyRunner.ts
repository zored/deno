import { green } from "../../../deps.ts";
import { sh, shOut } from "../command.ts";
import { ProxyHandler } from "./ProxyHandler.ts";
import { SSHHandler } from "./ProxyHandler/SSHHandler.ts";
import { DockerHandler } from "./ProxyHandler/DockerHandler.ts";
import { MongoHandler } from "./ProxyHandler/MongoHandler.ts";
import { ScreenHandler } from "./ProxyHandler/ScreenHandler.ts";
import { K8SHandler } from "./ProxyHandler/K8SHandler.ts";
import { ProxyConfig, ProxyConfigs } from "./ProxyConfigs.ts";
import { ProxyConfigTree } from "./ProxyConfigTree.ts";
import { CommandBuilder } from "./CommandBuilder.ts";

export type Params = Record<string, any>;
export type ShCommands = string[];
export type ExecSubCommand = (command: ShCommands) => Promise<string>;

export class ProxyRunner {
  private readonly handlers: ProxyHandler<any>[] = [
    new SSHHandler(),
    new DockerHandler(),
    new MongoHandler(),
    new ScreenHandler(),
    new K8SHandler(),
  ];
  public readonly configs: ProxyConfigTree;

  constructor(
    configs: ProxyConfigs,
    private readonly debug = false,
    handlers: ProxyHandler<any>[] = [],
  ) {
    this.configs = new ProxyConfigTree(configs);
    handlers.forEach((h) => this.handlers.push(h));
  }

  run = async (
    pathOrAlias: string,
    lastArgs: ShCommands,
    isEval: boolean,
    params: Params,
    dry: boolean,
  ): Promise<ShCommands> => {
    const configs = this.configs.getBranch(pathOrAlias);
    if (!configs.length) {
      console.log(`No proxies for '${pathOrAlias}'.`);
      throw new Error(
        `No proxy branch found for path '${pathOrAlias}'. Possible options are:${
          this.configs.getIds().sort().map((i) => `\n${i}`).join("")
        }`,
      );
    }

    const commands = new CommandBuilder();
    for (const config of configs) {
      commands.add(
        (await this.createProxyCommands(
          config,
          params,
          (cs) => this.exec(commands.with(cs)),
        )),
      );
    }

    commands.add(
      this.getLastProxyCommands(configs, isEval, lastArgs),
    );

    if (dry) {
      this.log(commands, true);
    } else {
      await this.tty(commands);
    }
    return commands.toArray();
  };

  private getLastProxyCommands(
    configs: ProxyConfig[],
    isEval: boolean,
    lastProxyArgs: ShCommands,
  ): ShCommands {
    const [config] = configs.slice(-1);
    const handler = this.getHandler(config);
    return (isEval
      ? handler.getEval(lastProxyArgs.join(" "), config)
      : handler.getTty(config).concat(lastProxyArgs))
      .map((a) => this.enrichArgument(a, config))
      .map((a) => configs.length > 1 ? `'${a}'` : a);
  }

  private exec = async (cs: CommandBuilder) => {
    this.log(cs);
    return await shOut(cs.toArray());
  };

  private tty = async (cs: CommandBuilder) => {
    this.log(cs);
    await sh(cs.toArray());
  };

  private log(cs: CommandBuilder, force = false) {
    if (force || this.debug) {
      console.log(green(cs.toString()));
    }
  }

  private createProxyCommands = async (
    config: ProxyConfig,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<ShCommands> => {
    const handler = this.getHandler(config);
    await handler.handleParams(
      config,
      params,
      exec,
    );

    const { flags } = config;
    return handler
      .handle(config)
      .concat(
        Object.entries(flags || {}).reduce(
          (commands, [name, value]) => {
            const flag = `--${name}`;
            if (value === true) {
              commands.push(flag);
              return commands;
            }
            if (value === false || value === undefined || value === null) {
              return commands;
            }
            commands.push(flag);
            commands.push(value.toString());
            return commands;
          },
          [] as ShCommands,
        ),
      );
  };

  private enrichArgument = (a: string, c: ProxyConfig): string =>
    this.getHandler(c).enrichArgument(a, c);

  private getHandler(c: ProxyConfig): ProxyHandler<any> {
    const handler = this.handlers.find((h: ProxyHandler<any>) => h.suits(c));
    if (!handler) {
      throw new Error(`No handler found for proxy: ${JSON.stringify(c)}`);
    }
    return handler;
  }
}
