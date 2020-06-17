#!/usr/bin/env deno run --allow-run
import { Args } from "https://deno.land/std/flags/mod.ts";
import { assertAllTracked, Commands, GitHooks, Runner, sh } from "./mod.ts";

const format = (check = false) =>
  new Runner().run(
    `deno fmt ${check ? "--check " : ""}./src ./run.ts ./deps.ts`,
  );

const test = () => new Runner().run(`deno test -A`);
const gitHooks = new GitHooks({
  "pre-commit": async () => {
    await assertAllTracked();
    await format(true);
    await test();
  },
});
const hooks = (args: Args) => gitHooks.run(args);
await new Commands({
  test,
  hooks,
  fmt: ({ lint }) => format(!!lint),
  run: ({ _: [name, args] }) => sh(`./src/${name}.ts ${args}`),
}).runAndExit();
