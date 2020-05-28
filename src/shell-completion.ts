#!/usr/bin/env -S deno run --allow-write --quiet
import { CompletionCommandFactory } from "./lib/shell-completion.ts";
import { Commands } from "../mod.ts";

const commands = new Commands({sample: () => console.log('hello, world!')});
new CompletionCommandFactory(import.meta.url, "shell-completion").apply(commands);
await commands.runAndExit();
