import type { ExecSubCommand, Params, ShCommands } from "./ProxyRunner.ts";
import type { ProxyConfig } from "./ProxyConfigs.ts";

/**
 * Handles specific shell-proxy config node and retrieves commands depending on context.
 */
export abstract class ProxyHandler<Config extends ProxyConfig> {
  abstract suits(c: Config): boolean;

  getChainBase(c: Config, last: boolean): ShCommands {
    return [
      ...this.getBase(c),
      ...this.getFlags(c),
    ];
  }

  protected abstract getBase(c: Config): ShCommands;

  getEval = async (
    cs: ShCommands,
    config: Config,
    exec: ExecSubCommand,
  ): Promise<ShCommands> => cs;
  getTty = (c: Config): ShCommands => [];

  handleParams = async (
    c: Config,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<boolean | void> => {};

  enrichArgument = async (
    a: string,
    proxyConfig: Config,
    params: Params,
    exec: ExecSubCommand,
  ) => [a];

  protected getFlags = (config: ProxyConfig): ShCommands =>
    Object.entries(config.flags || {}).reduce(
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
    );
}
