#!/usr/bin/env -S deno run --allow-write --quiet
import { CompletionCommandFactory } from "./lib/shell-completion.ts";
import { Commands } from "../mod.ts";

const commands = new Commands({ sample: { bamble: () => console.log("hi!") } });
new CompletionCommandFactory(import.meta.url, "shell-completion").apply(
  commands,
);
await commands.runAndExit();
