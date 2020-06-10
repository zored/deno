#!/usr/bin/env -S deno run --allow-run --allow-write --allow-read
import {
  Commands,
  print,
  GitClient,
  GitPaths,
  MessageBuilderRepo,
} from "../mod.ts";

const git = new GitClient();

const messageBuilders = new MessageBuilderRepo();

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
  message: {
    add: ({ _:message }) =>
      messageBuilders.each((b) =>
        b.add(message.join(" "))
      ),
    flush: async () => {
      let message = "";
      await messageBuilders.each((b) => message = b.flush());
      await print(message);
    },
  },
}).runAndExit();
