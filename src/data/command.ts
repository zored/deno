import { parse, Args } from "https://deno.land/std/flags/mod.ts";
const { args, exit } = Deno;

export type Command = (tailArgs: Args) => void;

export class Commands {
  constructor(private commands: Record<string, Command>) {}

  runAndExit(): void {
    exit(this.run());
  }
  run(): number {
    const commandArgs = parse(args);
    const [name, ...tail] = commandArgs._;
    commandArgs._ = tail;

    const command = this.commands[name];
    if (command) {
      return this.runOne(command, commandArgs);
    }
    const names = Object.keys(this.commands).join(", ");
    console.error(`Unknown command: ${name}.\nExpected commands: ${names}`);
    return 1;
  }

  private runOne(command: Command, args: Args) {
    try {
      command(args);
    } catch (e) {
      console.error(`Command run error!`, e);
      return 1;
    }
    return 0;
  }
}
