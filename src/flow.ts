#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read
import { Commands, print } from "../mod.ts";
import { GitClient } from "./lib/git.ts";
import { IssueCacherFactory } from "./lib/jira.ts";

const jira = new IssueCacherFactory().fromEnv();
const git = new GitClient();

new Commands({
  recent: async ({ i, a, b }) => {
    const refs = (await git.recentRefs()).slice(a || -Infinity, b || +Infinity);
    const issues: string[] = [];
    for (let ref of refs) {
      try {
        const summary = await jira.one(ref);
        issues.push(`${ref} ${summary}`);
      } catch (e) {
        continue;
      }
    }
    const output = ((i === undefined)
      ? issues.concat([""]).join("\n")
      : issues[parseInt(i + "")]);
    await print(output);
  },
}).runAndExit();
