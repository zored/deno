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
import { secrets } from "./rob-only-upsource.ts";
import { Err, UpsourceApi, VoidMessage } from "./lib/upsource.ts";

const {
  authorization: upsourceAuth,
  host: upsourceHost,
  projectId: upsourceProjectId,
} = secrets;

async function sleepMs(ms = 1) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJira() {
  return await new BrowserClientFactory().create();
}

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
    const jira = await getJira();
    const issues = await jira.fetchAllIssues(BrowserClient.JQL_MY_UNRESOLVED);
    console.log(JSON.stringify(
      issues
        .sort(({ id: a }, { id: b }) => a - b)
        .map(({ key, status, summary }) => ({
          key,
          url: BrowserClientFactory.getHost() + "/browse/" + key,
          status,
          summary,
        })),
    ));
  },
  putBranchReview: async ({ w }) => {
    const git = new GitClient(),
      issue = await git.getCurrentBranch(),
      originUrl = (await git.getOriginUrl()),
      revisions = (await git.getCurrentBranchHashes()),
      matches = originUrl.match(/\/([^\/]*).git$/);
    if (!matches) {
      throw new Error(`Invalid remote url: ${originUrl}`);
    }
    const gitlabProject = matches[1];
    if (revisions.length === 0) {
      throw new Error(`No revisions found for issue ${issue}.`);
    }

    const upsourceApi = new UpsourceApi(upsourceHost, upsourceAuth);
    const reviewsResponse = await upsourceApi.getReviews({
      limit: 100,
      query: `${issue}`,
    });

    const isErr = function <T>(e: T | Err): e is Err {
      return !!(e as unknown as Err).error;
    };

    if (isErr(reviewsResponse)) {
      throw new Error(
        `Reviews retrival error: ${reviewsResponse.error.message}`,
      );
    }

    const reviews = reviewsResponse.result.reviews || [];
    let review = reviews.find((r) => r.title.includes(issue));

    let responses: Err[] = [];
    let action = "create";
    if (review) {
      action = "update";
      const { reviewId } = review;
      while (true) {
        const responses = await Promise.all(
          revisions
            .map((r) => `${gitlabProject}-${r}`)
            .map((revisionId) =>
              upsourceApi.addRevisionToReview({ reviewId, revisionId })
            ),
        );
        const alreadyExistErrors = responses
          .filter((v): v is Err => !!(v as Err).error)
          .filter((v) => v.error.code === 1001);
        const successResponses = responses.filter((v): v is VoidMessage =>
          !(v as Err).error
        );

        if (
          !w ||
          (alreadyExistErrors.length + successResponses.length) ===
            revisions.length
        ) {
          break;
        }

        console.log(JSON.stringify(responses));
        await sleepMs(3000);
      }
    } else {
      const jira = await getJira();
      const title = issue + " " + await jira.getIssueSummary(issue);

      while (true) {
        const reviewResponse = await upsourceApi.createReview({
          title,
          revisions,
          branch: `${issue}#${gitlabProject}`,
          projectId: upsourceProjectId,
        });
        if (!isErr(reviewResponse)) {
          review = reviewResponse;
          break;
        }
        if (reviewResponse.error.code !== 106) { // Branch not found
          throw new Error(
            `Review creation error: ${(reviewResponse.error.message)}`,
          );
        }

        console.log({ reviewResponse });
        await sleepMs(3000);
      }
    }

    console.log(JSON.stringify({ review, revisions, responses, action }));
  },
});
