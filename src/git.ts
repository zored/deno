#!/usr/bin/env -S deno run --allow-run --allow-read
import { Commands, print } from "../mod.ts";
import { GitClient, GitPaths } from "../mod.ts";

new Commands({
  recent: async ({ _: [i] }) => {
    const refs = await new GitClient().recentRefs();
    const output = ((i === undefined)
      ? refs.concat([""]).join("\n")
      : refs[parseInt(i + "")]);
    await print(output);
  },
  root: ({ _: [query], root = "/Users/r.akhmerov/git" }) =>
    new GitPaths(root).getOptions(query + ""),
}).runAndExit();
