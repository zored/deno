import { ShCommands } from "./ProxyRunner.ts";

export function getNestedCommand(command: string, depth: number): string {
  if (command === "") {
    return "";
  }
  if (depth < 0) {
    return command;
  }
  const q = getNestedSingleQuote(depth);
  return `\$${q}${command}${q}`;
}

export function getNestedSingleQuote(depth: number): string {
  return "\\".repeat(Math.pow(2, depth) - 1) + `'`;
}

export function tailNest(
  cs: (string | string[])[],
  escapeRoot = true,
): ShCommands {
  return cs.slice().reverse().reduce(
    (r, c, i) => {
      if (Array.isArray(r)) {
        throw new Error("Array must be at the end");
      }
      const depth = cs.length - i - (escapeRoot ? 1 : 2);
      const nestedCommand = getNestedCommand(r, depth);

      const cAsArray = typeof c === "string" ? [c] : c;
      if (depth > (escapeRoot ? 0 : -1)) {
        const s = cAsArray.join(" ");
        return nestedCommand === "" ? s : `${s} ${nestedCommand}`;
      }

      const commands: string[] = typeof c === "string" ? c.split(" ") : c;
      if (nestedCommand !== "") {
        commands.push(nestedCommand);
      }
      return commands;
    },
    "" as string | string[],
  ) as string[];
}
