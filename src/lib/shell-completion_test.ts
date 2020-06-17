const { test } = Deno;
import {
  assertEquals,
  assertStrContains,
} from "../../deps.ts";
import {
  Generator,
  Completor,
  WordRetriever,
  CommandFactory,
} from "./shell-completion.ts";
import { Commands } from "./command.ts";
test("generator", () => {
  const file = "/some/file.ts";
  const result = new Generator(`file://${file}`, "generote").generate(
    "some/alias.here",
  );
  assertStrContains(
    result,
    "complete -F _somealiashere_zored_shell_completion some/alias.here",
  );
  assertStrContains(result, `$(${file} generote`);
});

const lineToSh = (line: string): string[] => {
  const COMP_POINT = line.indexOf("|");
  const COMP_LINE = line.replace("|", "");
  const COMP_WORDBREAKS = " ";
  const COMP_WORDS = COMP_LINE.split(COMP_WORDBREAKS);
  const COMP_CWORD = line.split(COMP_WORDBREAKS).findIndex((w) =>
    w.includes("|")
  );

  return [
    COMP_CWORD + "",
    COMP_POINT + "",
    COMP_LINE,
    COMP_WORDBREAKS,
    ...COMP_WORDS,
  ];
};

test("completor sh", () => {
  const tree: WordRetriever = (i) => {
    const result = i.fromTree({
      foo: null,
      bar: {
        baz: {
          foo: null,
          fook: null,
        },
      },
    });
    return result;
  };
  const input: [string, WordRetriever, number, string][] = [
    ["app create wo|rld", () => ["wordio", "format"], 2, "wordio"],
    ["app cre|ate world", () => ["wordio", "format"], 2, ""],
    ["app cre|ate world", () => ["wordio", "format"], 1, ""],
    ["app cre|ate world", () => ["cream", "creepy"], 1, "cream creepy"],
    ["app f|", tree, 1, "foo"],
    ["app bar ba|", tree, 1, "baz"],
    ["app bar baz fo|", tree, 1, "foo fook"],
  ];
  input.forEach(
    ([line, options, depth, completions]) => {
      assertEquals(
        completions,
        new Completor(options, depth).run(lineToSh(line)),
      );
    },
  );
});

test("command", async () => {
  const commands = new Commands({ goodbye: { cruel: { world: () => {} } } });
  new CommandFactory(
    "path/to.ts",
    "app.ts",
    "gen",
    "completur",
    (s: string) => assertEquals("world", s),
  ).apply(commands);

  const result = commands.run(
    { _: ["completur"].concat(lineToSh("app.ts goodbye cruel w|")) },
  );
  assertEquals(0, await result);
});
