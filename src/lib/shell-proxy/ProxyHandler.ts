import { ExecSubCommand, Params, ShCommands } from "./ProxyRunner.ts";
import { IProxy } from "./IConfig.ts";

export abstract class ProxyHandler<T extends IProxy> {
  abstract handle(c: T): ShCommands;

  abstract suits(c: T): boolean;

  getEval = (command: string, c: T) => [command];

  enrichArgument = (a: string, c: T) => a;

  getTty = (c: T): ShCommands => [];

  handleParams = async (
    c: T,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<void> => {};
}
