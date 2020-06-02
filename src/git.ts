#!/usr/bin/env -S deno run --allow-run
import { Commands, print } from "../mod.ts";
import { GitClient } from "./lib/git.ts";

new Commands({
  recent: async ({ _: [i] }) => {
    const refs = await new GitClient().recentRefs();
    const output = ((i === undefined)
      ? refs.concat([""]).join("\n")
      : refs[parseInt(i + "")]);
    await print(output);
  },
}).runAndExit();
