import { ShCommands } from "./ProxyRunner.ts";

export class CommandBuilder {
  constructor(private readonly commands: ShCommands[] = []) {
  }
  add = (line: ShCommands) => this.commands.push(line);
  toString = () =>
    this.commands
      .map((word) => word.join(" "))
      .map((line, i) => " ".repeat(i) + line)
      .join(" \\\n");

  toArray = () => this.commands.flat();

  with = (cs: ShCommands) =>
    new CommandBuilder(this.commands.slice().concat(cs));
}
