#!/usr/bin/env deno run -A --unstable
import {
  BrowserClient,
  BrowserClientFactory,
  IssueKey,
  print,
  runCommands,
} from "../mod.ts";
import { GitClient } from "./lib/git.ts";
import { CliSelect } from "./lib/unstable-command.ts";
import { IssueCacherFactory } from "./lib/jira.ts";
import {
  createUpsourceApi,
  Err,
  ReviewDescriptor,
  UpsourceError,
  UpsourceService,
  VoidMessage,
} from "./lib/upsource.ts";
import { sleepMs } from "./lib/utils.ts";
import { loadDefault } from "./lib/configs.ts";

function getJiraIssueUrl(key: IssueKey): string {
  return BrowserClientFactory.get().getHost() + "/browse/" + key;
}

function getJira(): BrowserClient {
  return BrowserClientFactory.get().create();
}

function getGit(): GitClient {
  return new GitClient();
}

function getIssueKeyFromCommitMessage(m: string): IssueKey | null {
  const matches = m.match(/^\s*(\w+-\d+).*/);
  if (matches) {
    return matches[0];
  }

  return null;
}

await runCommands({
  async recent({ i, a, b, n }: any) {
    const refs = (await getGit().recentRefs()).slice(
      a || -Infinity,
      b || +Infinity,
    );
    const issues: string[] = [];
    const issueRefs: string[] = [];
    for (let ref of refs) {
      try {
        const summary = await (new IssueCacherFactory().create()).one(ref);
        issues.push(`${ref} ${summary}`);
        issueRefs.push(ref);
      } catch (e) {
      }
    }

    const all = (): string => issues.concat([""]).join("\n");
    const one = (i: number): string => issues[i];
    const interactive = async (): Promise<string> =>
      await new CliSelect().select(issues, (o, i) => issueRefs[i]);

    const output = (n ? await interactive() : ((i >= 0) ? one(i) : all()));

    await print(output);
  },

  async status() {
    const jira = getJira();
    const issues = await jira.fetchAllIssues(
      BrowserClient.JQL_MY_UNRESOLVED,
    );

    const issueKeysFromActiveIssues = issues.map((s) => s.key);

    const upsourceApi = createUpsourceApi();
    const upsource = new UpsourceService(upsourceApi);
    const myReviews = (await upsource.getAllMyReviews()).result.reviews || [];
    const revisions = (await Promise.all(myReviews.map((r) =>
      upsourceApi.getRevisionsInReview(r.reviewId)
    ))).flat();
    const issueKeysFromRevisions = revisions.flatMap((r) =>
      r.result.allRevisions.revision
    )
      .map((r) =>
        getIssueKeyFromCommitMessage(r.revisionCommitMessage)
      )
      .filter((k): k is IssueKey => k !== null);

    const issueKeys = new Set([
      ...issueKeysFromActiveIssues,
      ...issueKeysFromRevisions,
    ]);

    Array.from(issueKeys).map((k) =>
      jira.getIssueFields(k, ["status", "summary", "parent", ""])
    );

    console.log(JSON.stringify(
      issues
        .sort((a, b) => a.id - b.id)
        .map(({ key, status, summary }) => ({
          key,
          url: getJiraIssueUrl(key),
          status,
          summary,
        })),
    ));
  },

  async putBranchReview({ w }: any) {
    const issueKey = await getGit().getCurrentBranch(),
      originUrl = (await getGit().getOriginUrl()),
      revisions = (await getGit().getCurrentBranchHashes()),
      matches = originUrl.match(/\/([^\/]*).git$/);
    if (!matches) {
      throw new Error(`Invalid remote url: ${originUrl}`);
    }
    const gitlabProject = matches[1];
    if (revisions.length === 0) {
      throw new Error(`No revisions found for issue ${issueKey}.`);
    }

    const upsource = createUpsourceApi();
    let responses: any[] = [];
    let action = "create";
    let review: ReviewDescriptor | undefined;

    while (true) {
      const reviewsResponse = await upsource.getReviews({
        limit: 100,
        query: `${issueKey}`,
      });

      const reviews: ReviewDescriptor[] = reviewsResponse.result.reviews || [];
      review = reviews.find((r) => r.title.includes(issueKey));

      if (review) {
        action = "update";
        const { reviewId } = review;
        responses = await Promise.all(
          revisions
            .map((r) => `${gitlabProject}-${r}`)
            .map((revisionId) =>
              upsource.addRevisionToReview({ reviewId, revisionId })
            ),
        );
        const alreadyExistErrors = responses
          .filter((v): v is Err => !!(v as Err).error)
          .filter((v) =>
            v.error.message.includes("because it is already part of ReviewId")
          );
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
        await sleepMs(5000);
        continue;
      }

      let reviewResponse: ReviewDescriptor;
      try {
        reviewResponse = await upsource.createReview({
          revisions,
          branch: `${issueKey}#${gitlabProject}`,
          projectId: (loadDefault("upsource") as any).projectId,
        });
      } catch (e) {
        if (!(e instanceof UpsourceError)) {
          throw e;
        }
        if (e.code !== UpsourceError.CODE_BRANCH_NOT_FOUND) {
          throw new Error(`Review creation error: ${(e.message)}`);
        }
        console.error({ e });
        await sleepMs(5000);
        continue;
      }
      responses = [reviewResponse];
      review = reviewResponse;
      const title = issueKey + " " +
        await getJira().getIssueSummary(issueKey);
      await upsource.renameReview({
        reviewId: review.reviewId,
        text: title,
      });
      const url = getJiraIssueUrl(issueKey);
      await upsource.editReviewDescription({
        reviewId: review.reviewId,
        text: `[${title}](${url})`,
      });
      break;
    }

    console.log(JSON.stringify({ review, revisions, responses, action }));
  },
});
