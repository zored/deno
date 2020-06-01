#!/usr/bin/env -S deno run --allow-run
import { Args } from "https://deno.land/std/flags/mod.ts";
import {
  Info,
  Commands,
  Runner,
  GitHooks,
} from "./mod.ts";

const format = (check = false) =>
  new Runner().run(`deno fmt ${check ? "--check " : ""}./src ./run.ts`);

const test = () => new Runner().run(`deno test -A`);
const gitHooks = new GitHooks({
  "pre-commit": async () => {
    await format(true);
    await test();
  },
});
const hooks = (args: Args) => gitHooks.run(args);
await new Commands({ test, hooks, fmt: () => format() }).runAndExit();
