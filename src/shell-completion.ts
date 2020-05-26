#!/usr/bin/env -S deno run --allow-write --quiet
import { CompletionCommandFactory } from "./lib/shell-completion.ts";
import { Commands } from "../mod.ts";
import { Silent } from "./lib/command.ts";

const completions = (new CompletionCommandFactory().createAll("shell-completion"))
await new Commands({
  ...completions,
}, new Silent()).runAndExit();
