#!/usr/bin/env -S deno run --allow-run
import { Args } from "https://deno.land/std/flags/mod.ts";
import {
  Info,
  Commands,
  Runner,
  GitHooks,
} from "./mod.ts";

console.log(import.meta);

const test = () => new Runner().run(`deno test -A`);
const fmt = () => new Runner().run(`deno fmt ./src`);
const gitHooks = new GitHooks({ "pre-commit": async () => await test()});
const hooks = (args: Args) => gitHooks.run(args);
await new Commands({ test, hooks, fmt }).runAndExit();

