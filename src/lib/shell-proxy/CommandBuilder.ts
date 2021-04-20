import type { ShCommands } from "./ProxyRunner.ts";

export class CommandBuilder {
  constructor(private readonly commands: ShCommands[] = []) {
  }

  add(line: ShCommands) {
    return this.commands.push(line);
  }

  toString() {
    return this.commands
      .map((cs) =>
        cs
          .map((c) => this.escapeCommand(c))
          .join(" ")
      )
      .map((line, i) => " ".repeat(i) + line)
      .join(" \\\n");
  }

  toArray() {
    return this.commands.flat();
  }

  with(cs: ShCommands) {
    return new CommandBuilder(this.commands.slice().concat([cs]));
  }

  private escapeCommand = (c: string) => /[\s]/.test(c) ? `'${c}'` : c;
}
