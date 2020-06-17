#!/usr/bin/env deno run --allow-write --quiet
import { completionByCommands } from "./lib/shell-completion.ts";
import { Commands } from "../mod.ts";

const commands = new Commands(
  { sample: { bamble: { dable: () => console.log("hi!") } } },
);
completionByCommands(import.meta, commands, "shell-completion");
await commands.runAndExit();
