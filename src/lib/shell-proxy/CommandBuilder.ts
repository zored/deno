import type { ShCommands } from "./ProxyRunner.ts";
import { tailNest } from "./utils.ts";
import { debugLog } from "../utils.ts";

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

  toRunnable(): string[] {
    return tailNest(this.getRunnableArray(), false);
  }

  with(cs: ShCommands) {
    return new CommandBuilder(this.commands.slice().concat([cs]));
  }

  getDepth() {
    return this.getRunnableArray().length;
  }

  private getRunnableArray() {
    return this.commands.filter((cs) => cs.length > 0);
  }

  private escapeCommand = (c: string) => {
    return /[\s]/.test(c) ? `'${c}'` : c;
  };
}
