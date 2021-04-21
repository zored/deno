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
  Resulting,
  Review,
  RevisionsInReviewResponse,
  UpsourceError,
  UpsourceService,
  VoidMessage,
} from "./lib/upsource.ts";
import { sleepMs } from "./lib/utils.ts";
import { loadDefault } from "./lib/configs.ts";
import { fromPairs, zip } from "../deps.ts";

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
    return matches[1];
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
    const jira = getJira(),
      upsourceApi = createUpsourceApi(),
      upsource = new UpsourceService(upsourceApi);

    const reviews = (await upsource.getAllMyReviews()).result.reviews || [];
    const revisionsForReview = await Promise.all(
      reviews.map((r) => upsourceApi.getRevisionsInReview(r.reviewId)),
    );

    const reviewsWithKeys: [Review, Set<IssueKey>][] =
      (zip(reviews, revisionsForReview) as [
        Review,
        Resulting<RevisionsInReviewResponse>,
      ][])
        .map(([review, revisions]) =>
          [
            review,
            new Set(
              revisions.result.allRevisions.revision
                .map((r) =>
                  getIssueKeyFromCommitMessage(r.revisionCommitMessage)
                ).filter((s) => s !== null),
            ),
          ] as [Review, Set<IssueKey>]
        );

    const reviewsByKey = reviewsWithKeys
      .flatMap(([review, keys]) =>
        Array.from(keys).map((k) => [k, review] as [IssueKey, Review])
      )
      .reduce((all, [k, r]) => {
        const reviews = all[k] ?? [];
        reviews.push(r);
        all[k] = reviews;
        return all;
      }, {} as Record<IssueKey, Review[]>);

    const automatedInfoField = "customfield_54419";
    const lastViewed = (a: any): number =>
      (new Date(a.fields.lastViewed)).getTime();

    console.log(JSON.stringify(
      await Promise.all(
        (await Promise.all(
          [
            ...new Set<IssueKey>([
              ...((await jira.fetchAllIssues(
                BrowserClient.JQL_MY_UNRESOLVED,
              )).map((issue) => issue.key)),
              ...reviewsWithKeys.flatMap(([, k]) => [...k]),
            ]),
          ].map((key) =>
            jira.getIssueFields(key, [
              "status",
              "summary",
              "parent",
              "lastViewed",
              "assignee",
              automatedInfoField,
            ])
          ),
        ))
          .sort((a, b) => lastViewed(a) - lastViewed(b))
          .map(async (t) => {
            let parent = null;
            if (t.fields.parent) {
              const {
                key,
                fields: {
                  summary,
                  status: { name: status },
                  issuetype: { name: issuetype },
                },
              } = t.fields.parent;
              parent = {
                key,
                summary,
                url: getJiraIssueUrl(key),
                status,
                issuetype,
              };
            }

            const {
              key,
              fields: {
                summary,
                status: { name: status },
                assignee: { displayName: assignee },
                [automatedInfoField]: automatedInfo,
              },
            } = t;

            const issue: any = {
              key,
              summary,
              url: getJiraIssueUrl(key),
              status,
              assignee,
            };

            if (!(automatedInfo || "").includes("Result: Success")) {
              issue.automatedError = automatedInfo;
            }

            if (parent) {
              issue.parent = parent;
            }

            const r: any = { issue };

            const reviews = reviewsByKey[key];
            if (reviews && reviews.length > 0) {
              r.reviews = await upsource.output(reviews);
            }
            return r;
          }),
      ),
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
    let review: Review | undefined;

    while (true) {
      const reviewsResponse = await upsource.getReviews({
        limit: 100,
        query: `${issueKey}`,
      });

      const reviews: Review[] = reviewsResponse.result.reviews || [];
      review = reviews.find((r) => r.title.includes(issueKey));

      if (review) {
        action = "update";
        const { reviewId } = review;
        responses = await Promise.all(
          revisions
            .map((r) => `${gitlabProject}-${r}`)
            .map((revisionId) =>
              upsource.addRevisionToReview({ reviewId, revisionId }).catch((
                e: UpsourceError,
              ) => e)
            ),
        );
        const alreadyExistErrors = responses
          .filter((v): v is UpsourceError => v instanceof UpsourceError)
          .filter((e) =>
            e.message.includes("because it is already part of ReviewId")
          );
        const successResponses = responses.filter((v): v is VoidMessage =>
          !(v instanceof UpsourceError)
        );

        if (
          !w ||
          (alreadyExistErrors.length + successResponses.length) ===
            revisions.length
        ) {
          break;
        }

        console.error(JSON.stringify(responses));
        await sleepMs(10000);
        continue;
      }

      let reviewResponse: Review;
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
        console.error({ e });
        await sleepMs(10000);
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
