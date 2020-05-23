import { parse, Args } from "https://deno.land/std/flags/mod.ts";
import { green, red } from "https://deno.land/std@0.52.0/fmt/colors.ts";
const { args, exit, run } = Deno;

type CommandSync = (tailArgs: Args) => void;
type CommandAsync = (tailArgs: Args) => Promise<any>;
export type Command = CommandSync | CommandAsync;

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

export class Logger implements ILogger {
  success(s: string): void {
    console.log(green(s));
  }
  error(s: string): void {
    console.error(red(s));
  }
}

export class Commands {
  constructor(
    private commands: Record<string, Command>,
    private logger: ILogger = new Logger(),
  ) {}

  async runAndExit(): Promise<void> {
    exit(await this.run());
  }
  async run(): Promise<number> {
    const commandArgs = parse(args);
    const [name, ...tail] = commandArgs._;
    commandArgs._ = tail;

    const command = this.commands[name];
    if (command) {
      return await this.runOne(name, command, commandArgs);
    }
    const names = Object.keys(this.commands).join(", ");
    this.logger.error(`Unknown command: ${name}.\nExpected commands: ${names}`);

    return 1;
  }

  private async runOne(name: (string | number), command: Command, args: Args) {
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
