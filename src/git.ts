#!/usr/bin/env deno run -A
import {
  Commands,
  completionByCommands,
  GitClient,
  GitPaths,
  History,
  MessageBuilderRepo,
  print,
} from "../mod.ts";

const git = new GitClient();

const messageBuilders = new MessageBuilderRepo();
const defaultRoot = "/Users/r.akhmerov/git";

function getHistoryRepo() {
  return History.RepoFactory.create();
}

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
  history: {
    async push({ branch, dir }) {
      await getHistoryRepo().push(branch, dir);
    },
    async list() {
      console.log(JSON.stringify(getHistoryRepo().list()));
    },
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
