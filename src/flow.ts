#!/usr/bin/env deno run -A --unstable
import {
  BrowserClient,
  BrowserClientFactory,
  print,
  runCommands,
} from "../mod.ts";
import { GitClient } from "./lib/git.ts";
import { CliSelect } from "./lib/unstable-command.ts";
import { IssueCacherFactory } from "./lib/jira.ts";

await runCommands({
  recent: async ({ i, a, b, n }) => {
    const refs = (await new GitClient().recentRefs()).slice(
      a || -Infinity,
      b || +Infinity,
    );
    const issues: string[] = [];
    const issueRefs: string[] = [];
    for (let ref of refs) {
      try {
        const summary = await (await new IssueCacherFactory().fromEnv()).one(
          ref,
        );
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
  status: async () => {
    const jiraFactory = new BrowserClientFactory();
    const jira = await jiraFactory.create();
    const issues = await jira.fetchAllIssues(BrowserClient.JQL_MY_UNRESOLVED);
    console.log(JSON.stringify(
      issues
        .sort(({ id: a }, { id: b }) => a - b)
        .map(({ key, status, summary }) => ({
          url: jiraFactory.getHost() + "/browse/" + key,
          status,
          summary,
        })),
    ));
  },
});
