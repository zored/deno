import { parse, Args } from "https://deno.land/std/flags/mod.ts";
import { green, red } from "https://deno.land/std@0.52.0/fmt/colors.ts";
const { args, exit, run } = Deno;

type CommandSync = (tailArgs: Args) => void;
type CommandAsync = (tailArgs: Args) => Promise<any>;
export interface CommandMap extends Record<string, Command> {}
export type Command = CommandSync | CommandAsync | CommandMap;

export class Runner {
  async run(command: string) {
    const process = run({
      cmd: command.split(" "),
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.status();
    if (code !== 0) {
      throw new Error("Command failed");
    }
  }
}

export interface ILogger {
  success(s: string): void;
  error(s: string): void;
}

export class Silent implements ILogger {
  success(s: string): void {
  }
  error(s: string): void {
    console.error(s);
  }
}

export class ConsoleLogger implements ILogger {
  success(s: string): void {
    console.log(green(s));
  }
  error(s: string): void {
    console.error(red(s));
  }
}

type Arg = (string | number);

export interface ICommandsConfig {
  name: string;
  children?: ICommandsConfig[];
}

export class Commands {
  add(commands: CommandMap): void {
    Object.keys(commands).forEach((name) =>
      this.commands[name] = commands[name]
    );
  }
  getConfig(
    root: ICommandsConfig = { name: "root", children: [] },
    commands: CommandMap = this.commands,
  ): ICommandsConfig {
    Object.keys(commands).forEach((name) => {
      const value = commands[name];
      root.children?.push(
        this.isMap(value)
          ? this.getConfig({ name, children: [] }, value)
          : { name },
      );
    });
    return root;
  }
  constructor(
    private commands: CommandMap,
    private logger: ILogger = new Silent(),
  ) {}

  async runAndExit(): Promise<void> {
    exit(await this.run());
  }

  async run(
    commandArgs: Args = parse(args),
    commands: CommandMap = this.commands,
  ): Promise<number> {
    const [name, ...tail] = commandArgs._;
    commandArgs._ = tail;

    const command = commands[name];
    if (command) {
      return await this.runOne(name, command, commandArgs);
    }
    const names = this.allNames(commands).join(", ");
    this.logger.error(`Unknown command: ${name}.\nExpected commands: ${names}`);

    return 1;
  }

  allNames(commands: CommandMap): string[] {
    return Object.keys(commands);
  }

  private isMap(command: Command): command is CommandMap {
    return typeof command !== "function";
  }

  private async runOne(
    name: Arg,
    command: Command,
    args: Args,
  ): Promise<number> {
    if (this.isMap(command)) {
      return this.run(args, command);
    }

    try {
      const output = command(args);
      if (output instanceof Promise) {
        await output;
      }
    } catch (e) {
      console.error(`Command run error!`, e);
      return 1;
    }
    this.logger.success(`Command "${name}" succeeded.`);
    return 0;
  }
}
