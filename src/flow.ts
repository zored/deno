#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --unstable
import { Commands, print } from "../mod.ts";
import { GitClient } from "./lib/git.ts";
import { CliSelect } from "./lib/unstable-command.ts";
import { IssueCacherFactory } from "./lib/jira.ts";

new Commands({
  recent: async ({ i, a, b, n }) => {
    const refs = (await new GitClient().recentRefs()).slice(
      a || -Infinity,
      b || +Infinity,
    );
    const issues: string[] = [];
    const issueRefs: string[] = [];
    for (let ref of refs) {
      try {
        const summary = await new IssueCacherFactory().fromEnv().one(ref);
        issues.push(`${ref} ${summary}`);
        issueRefs.push(ref);
      } catch (e) {
      }
    }

    const all = (): string => issues.concat([""]).join("\n");
    const one = (i: number): string => issues[i];
    const select = async (): Promise<string> =>
      await new CliSelect().select(issues, (o, i) => issueRefs[i]);

    const output = (n ? await select() : ((i >= 0) ? one(i) : all()));

    await print(output);
  },
}).runAndExit();
