import { readKeypress } from "https://raw.githubusercontent.com/dmitriytat/keypress/0.0.1/mod.ts";
import { print } from "./print.ts";
import { green } from "../../deps.ts";

export class CliSelect {
  select = async <T>(
    options: string[],
    map: (option: string, index: number) => T,
  ): Promise<T> => {
    const buttons = "asdfjkl;".split("");
    const line = (button: string, option: string) =>
      `${green(button)}) ${option}`;
    const byButtons: Record<string, string> = {};
    options
      .slice(0, buttons.length)
      .forEach((option, i) => byButtons[buttons[i]] = option);

    const output = Object
      .entries(byButtons)
      .map(([button, option]) => line(button, option))
      .concat([""])
      .join("\n");
    await print(output, Deno.stderr);

    const [{ key: button }] = await readKeypress();
    const option = byButtons[button || ""];
    if (!option) {
      throw new Error(`No option found for button "${button}".`);
    }

    return map(option, options.indexOf(option));
  };
}
