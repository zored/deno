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
import { Err, ReviewDescriptor, UpsourceApi } from "./lib/upsource.ts";

const {
  authorization: upsourceAuth,
  host: upsourceHost,
  projectId: upsourceProjectId,
} = secrets;

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
    if (!review) {
      throw new Error(`No review containing "issue" found.`);
    }

    let errors: Err[] = [];
    if (review) {
      const { reviewId } = review;
      do {
        errors = (await Promise.all(
          revisions
            .map((r) => `${gitlabProject}-${r}`)
            .map((revisionId) =>
              upsourceApi.addRevisionToReview({ reviewId, revisionId })
            ),
        ))
          .filter((v): v is Err => !!(v as Err).error);
      } while (w && errors.length);
    } else {
      const jira = await getJira();
      const title = issue + " " + await jira.getIssueSummary(issue);
      const reviewResponse = await upsourceApi.createReview({
        title,
        revisions,
        branch: `${issue}#${gitlabProject}`,
        projectId: upsourceProjectId,
      });
      if (isErr(reviewResponse)) {
        throw new Error(
          `Review creation error: ${reviewResponse.error.message}`,
        );
      }
      review = reviewResponse;
    }

    console.log(JSON.stringify({ review, revisions, errors }));
  },
});
