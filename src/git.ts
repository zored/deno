#!/usr/bin/env deno run -A
import {
  Commands,
  completionByCommands,
  GitClient,
  GitPaths,
  MessageBuilderRepo,
  print,
} from "../mod.ts";

const git = new GitClient();

const messageBuilders = new MessageBuilderRepo();
const defaultRoot = "/Users/r.akhmerov/git";

const commands = new Commands({
  recent: async ({ _: [i] }) => {
    const refs = await git.recentRefs();
    const output = ((i === undefined)
      ? refs.concat([""]).join("\n")
      : refs[parseInt(i + "")]);
    await print(output);
  },
  root: ({ _: [query], root = defaultRoot, prefix = "v" }) =>
    console.log(new GitPaths(root).getOptions((query || "") + "").join("\n")),
  incVer: async ({ type = "patch", prefix = "v" }) => {
    const version = await git.lastVersion();
    version.inc(type);
    await git.pushNewTag(prefix + version);
  },
  message: {
    add: ({ _: message }) =>
      messageBuilders.each((b) =>
        b.add(message.join(" "))
      ),
    flush: async () => {
      let message = "";
      await messageBuilders.each((b) => message = b.flush());
      await print(message);
    },
  },
});

completionByCommands(import.meta, commands, "zdgit");

commands.runAndExit();
