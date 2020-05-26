#!/usr/bin/env -S deno run --allow-write --quiet
import {
  CompletionGenerator,
  CompletionHandler,
} from "./lib/shell-completion.ts";
import { Commands } from "../mod.ts";
import { Silent } from "./lib/command.ts";
const print = (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s));

const commands: Commands = new Commands({
  generate: () => print(new CompletionGenerator().generate("shell-completion")),
  complete: (args) =>
    print(
      new CompletionHandler(commands.allNames()).handle(
        args._.map((s) => s.toString()),
      ),
    ),
}, new Silent());
await commands.runAndExit();
