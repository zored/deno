import { readKeypress } from "https://raw.githubusercontent.com/dmitriytat/keypress/0.0.1/mod.ts";
import { print } from "./print.ts";
import { green } from "../../deps.ts";

export class CliSelect {
  select = async <T>(
    options: string[],
    map: (option: string, index: number) => T,
  ): Promise<T> => {
    console.log(options);
    const buttons = "asdfjkl;".split("");
    let page = 0;
    const prev = buttons.shift() ?? "";
    const next = buttons.pop() ?? "";
    const quit = "q";

    const perPage = buttons.length;
    const lastPage = Math.floor(options.length / perPage);
    const line = (button: string, option: string) =>
      `${green(button)}) ${option}`;
    const write = (s: string) => print(s, Deno.stderr);

    while (true) {
      const byButtons: Record<string, string> = {};
      const offset = page * perPage;
      options
        .slice(offset, buttons.length + offset)
        .forEach((option, i) => byButtons[buttons[i]] = option);

      const lines = Object
        .entries(byButtons)
        .map(([button, option]) => line(button, option));
      if (lastPage > 0) {
        lines.push(line(next, "👉"));
        lines.unshift(line(prev, "👈"));
      }
      lines.push(line(quit, "quit"));
      const output = ["", `Page ${page + 1} of ${lastPage + 1}. Select:`]
        .concat(
          lines.concat([""]),
        ).join("\n");
      await write(output);

      const [{ key: button }] = await readKeypress();

      await write(`You pressed: "${green(button + "")}".\n\n`);

      switch (button) {
        case prev:
          page--;
          if (page < 0) {
            page = lastPage;
          }
          break;
        case next:
          page++;
          if (page > lastPage) {
            page = 0;
          }
          break;
        case quit:
          Deno.exit(1);
          break;
        default:
          const option = byButtons[button || ""];
          if (!option) {
            throw new Error(`No option found for button "${button}".`);
          }

          return map(option, options.indexOf(option));
      }
    }
  };
}
