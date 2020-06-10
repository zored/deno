#!/usr/bin/env -S deno run --allow-run --allow-read
import { Commands, print, GitClient, GitPaths } from "../mod.ts";

const git = new GitClient();
new Commands({
  recent: async ({ _: [i] }) => {
    const refs = await git.recentRefs();
    const output = ((i === undefined)
      ? refs.concat([""]).join("\n")
      : refs[parseInt(i + "")]);
    await print(output);
  },
  root: ({ _: [query], root = "/Users/r.akhmerov/git", prefix = "v" }) =>
    new GitPaths(root).getOptions(query + ""),
  incVer: async ({ type = "patch", prefix = "v" }) => {
    const version = await git.lastVersion();
    version.inc(type);
    await git.pushNewTag(prefix + version);
  },
}).runAndExit();
