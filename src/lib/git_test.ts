import { assertEquals } from "../../deps.ts";
import { GitClient } from "./git.ts";

const notImplemented = async () => {
  throw new Error(`not implemented`);
};
Deno.test("client", async () => {
  const client = new GitClient({
    reflogSubjects: async () =>
      `
  HEAD@{2020-05-29 00:16:32 +0300}checkout: moving from feature/shell-completion to master
  HEAD@{2020-05-29 00:16:21 +0300}commit: [feature/shell-completion] Make basic working completion
        `.trim(),
    getUntracked: notImplemented,
    lastTag: notImplemented,
    pushNewTag: notImplemented,
  });
  assertEquals([{
    date: new Date("2020-05-29 00:16:32 +0300"),
    from: "feature/shell-completion",
    to: "master",
  }], await client.reflogSubjects());
});
