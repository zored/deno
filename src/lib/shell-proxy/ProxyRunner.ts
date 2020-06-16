import { green, red } from "../../../deps.ts";
import { sh, shOut } from "../command.ts";
import { ProxyHandler } from "./ProxyHandler.ts";
import { SSHHandler } from "./ProxyHandler/SSHHandler.ts";
import { DockerHandler } from "./ProxyHandler/DockerHandler.ts";
import { MongoHandler } from "./ProxyHandler/MongoHandler.ts";
import { ScreenHandler } from "./ProxyHandler/ScreenHandler.ts";
import { K8SHandler } from "./ProxyHandler/K8SHandler.ts";
import { IConfig, IProxy } from "./IConfig.ts";

const { args } = Deno;
export type Params = Record<string, any>;
export type ShCommands = string[];
export type ExecSubCommand = (command: ShCommands) => Promise<string>;

export class ProxyRunner {
  private handlers: ProxyHandler<any>[] = [
    new SSHHandler(),
    new DockerHandler(),
    new MongoHandler(),
    new ScreenHandler(),
    new K8SHandler(),
  ];

  constructor(
    private config: IConfig,
    private debug = false,
    handlers: ProxyHandler<any>[] = [],
  ) {
    handlers.forEach((h) => this.handlers.push(h));
  }

  run = async (
    name: string,
    lastProxyArgs: string[],
    isEval: boolean,
    params: Params,
    dry: boolean,
  ): Promise<ShCommands> => {
    const proxiesCommands: ShCommands = [];

    const configs = this.getConfigs(name, this.parseNamespace(namespace));
    for (const config of configs) {
      (await this.createProxyCommands(config, params, proxiesCommands))
        .forEach((c) => proxiesCommands.push(c));
    }

    const allCommands = proxiesCommands.concat(
      this.getLastProxyCommands(configs, isEval, lastProxyArgs),
    );

    if (dry) {
      this.log(allCommands, true);
    } else {
      await this.tty(allCommands);
    }
    return allCommands;
  };

  private getLastProxyCommands(
    configs: any[],
    isEval: boolean,
    lastProxyArgs: ShCommands,
  ): ShCommands {
    const [proxy] = configs.slice(-1);
    const handler = this.getHandler(proxy);
    return (isEval
      ? handler.getEval(lastProxyArgs.join(" "), proxy)
      : handler.getTty(proxy).concat(lastProxyArgs))
      .map((a) => this.enrichArgument(a, proxy))
      .map((a) => configs.length > 1 ? `'${a}'` : a);
  }

  private parseNamespace = (ns: string) =>
    ns
      .replace(/^\//, "")
      .replace(/\/$/, "") +
    "/";

  private exec = async (cs: ShCommands) => {
    this.log(cs);
    return await shOut(cs);
  };

  private tty = async (cs: ShCommands) => {
    this.log(cs);
    await sh(cs);
  };

  private log(cs: ShCommands, force = false) {
    if (force || this.debug) {
      console.log(green(cs.join(" ")));
    }
  }

  private createProxyCommands = async (
    config: IProxy,
    params: Params,
    previous: ShCommands,
  ): Promise<ShCommands> => {
    const handler = this.getHandler(config);
    await handler.handleParams(
      config,
      params,
      (cs) => this.exec(previous.concat(cs)),
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

  private enrichArgument = (a: string, c: IProxy): string =>
    this.getHandler(c).enrichArgument(a, c);

  private getHandler(c: IProxy): ProxyHandler<any> {
    const handler = this.handlers.find((h: ProxyHandler<any>) => h.suits(c));
    if (!handler) {
      throw new Error(`No handler found for proxy: ${JSON.stringify(c)}`);
    }
    return handler;
  }

  private getConfigs(name: string, namespace: string): any[] {
    const names = Object.keys(this.config);
    const fullsByAlias: Record<string, Set<string>> = {};
    Array
      .from(namespace.matchAll(/\//g))
      .map(({ index }) => namespace.substring(0, index))
      .forEach((namespace) =>
        names
          .filter((n) => n.indexOf(namespace) === 0)
          .map((n) => [n, n.substring(namespace.length + 1)])
          .forEach(([full, alias]) => {
            if (alias.indexOf("/") > -1) {
              return;
            }
            (fullsByAlias[alias] = fullsByAlias[alias] ?? new Set()).add(full);

            names.push(alias);
          })
      );

    const fulls = fullsByAlias[name] ?? new Set<string>();
    switch (fulls.size) {
      case 0:
        break;
      case 1:
        name = Array.from(fulls)[0];
        break;
      default:
        throw new Error(`Ambiguous ${name} for ${namespace}: ${fulls}`);
    }

    const proxyConfigs = this.config[name];
    if (!proxyConfigs) {
      console.log(
        `${
          red(`No config '${name}' found`)
        } for your namespace '${namespace}'. Use one of: ${
          names.map((n) => `\n- ${green(n)}`).join("")
        }`,
      );
      Deno.exit(1);
    }

    return proxyConfigs;
  }
}
