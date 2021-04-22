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
  ReviewId,
  RevisionInfo,
  RevisionsInReviewResponse,
  UpsourceError,
  UpsourceService,
  VoidMessage,
} from "./lib/upsource.ts";
import { fromPairsArray, sleepMs } from "./lib/utils.ts";
import { load } from "./lib/configs.ts";
import { fromPairs, zip } from "../deps.ts";
import { ConfigGitlabApiFactory, GitlabApi, ProjectId } from "./lib/gitlab.ts";

function getJiraIssueUrl(key: IssueKey): string {
  return BrowserClientFactory.get().getHost() + "/browse/" + key;
}

function getJira(): BrowserClient {
  return BrowserClientFactory.get().create();
}

function getGitlab(): GitlabApi {
  return (new ConfigGitlabApiFactory()).create();
}

function getGit(): GitClient {
  return new GitClient();
}

function getIssueKeyFromCommitMessage(c: string): IssueKey | null {
  const m = c.match(/^\s*(\w+-\d+).*/);
  if (!m) {
    return null;
  }
  return m[1];
}

function getProjectIdFromRevisionId(r: string): string | null {
  const m = r.match(/^(.+)-.{40}$/);
  if (!m) {
    return null;
  }
  return m[1];
}

function getStringReviewId(r: ReviewId): string {
  return `${r.projectId}-${r.projectId}`;
}

function getGitlabProjectFromVcsUrl(p: string): string | null {
  const m = p.match(/.*:(.*)\.git$/);
  if (!m) {
    return null;
  }
  return m[1];
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
    const gitlab = getGitlab(),
      jira = getJira(),
      upsourceApi = createUpsourceApi(),
      upsource = new UpsourceService(upsourceApi);

    const reviews = (await upsource.getAllMyReviews()).result.reviews || [];
    const revisionsForReview = await Promise.all(
      reviews.map((r) => upsourceApi.getRevisionsInReview(r.reviewId)),
    );

    const reviewsWithRevisions = (zip(reviews, revisionsForReview) as [
      Review,
      Resulting<RevisionsInReviewResponse>,
    ][]).map(([review, revisions]) =>
      [
        review,
        revisions.result.allRevisions.revision,
      ] as [Review, RevisionInfo[]]
    );

    const vcsRepoUrlByUpsourceProjectId: Record<string, string> = fromPairs(
      (await upsourceApi.getProjectVcsLinks({
        projectId: load<{ projectId: string }>("upsource").projectId,
      })).result.repo.map((v) => [v.id, v.url[0]]),
    );

    const projectIdsByReviewId: Record<string, string[]> = fromPairsArray(
      reviewsWithRevisions.flatMap(
        ([review, revisions]) =>
          revisions
            .map((r) =>
              [
                getStringReviewId(review.reviewId),
                getProjectIdFromRevisionId(r.revisionId),
              ] as [string, string | null]
            )
            .filter((a): a is [string, string] => a[1] !== null),
      ),
      true,
    );

    const reviewsWithKeys: [Review, Set<IssueKey>][] = reviewsWithRevisions
      .map(([review, revisions]) =>
        [
          review,
          new Set(
            revisions.map((r) =>
              getIssueKeyFromCommitMessage(r.revisionCommitMessage)
            ).filter((s) => s !== null),
          ),
        ] as [Review, Set<IssueKey>]
      );

    const reviewsByKey: Record<IssueKey, Review[]> = fromPairsArray(
      reviewsWithKeys
        .flatMap(([review, keys]) =>
          Array.from(keys).map((k) => [k, review] as [IssueKey, Review])
        ),
    );

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
                },
              } = t.fields.parent;
              parent = {
                summary,
                url: getJiraIssueUrl(key),
                status,
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
              summary,
              url: getJiraIssueUrl(key),
              status,
              assignee,
            };

            if (automatedInfo && !automatedInfo.includes("Result: Success")) {
              issue.automatedError = automatedInfo;
            }

            if (parent) {
              issue.parent = parent;
            }

            const r: any = { issue };

            const reviews = reviewsByKey[key];
            if (reviews && reviews.length > 0) {
              r.reviews = await upsource.output(reviews);
              const ref = key;

              const pipelines = (await Promise.all(
                reviews
                  .flatMap((r) =>
                    projectIdsByReviewId[getStringReviewId(r.reviewId)] ?? []
                  )
                  .map((upsourceProjectId) =>
                    vcsRepoUrlByUpsourceProjectId[upsourceProjectId]
                  )
                  .filter((v): v is string => !!v)
                  .map((vcsRepoUrl) => getGitlabProjectFromVcsUrl(vcsRepoUrl))
                  .filter((p): p is string => p !== null)
                  .map((p) =>
                    gitlab.getPipelines(p, { ref, per_page: 1, page: 1 })
                  ),
              ))
                .flat()
                .map(({ status, web_url }) => ({
                  status,
                  web_url,
                }));
              if (pipelines.length) {
                r.pipelines = pipelines;
              }
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
          projectId: load<{ projectId: string }>("upsource").projectId,
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
      // const title = issueKey + " " +
      //   await getJira().getIssueSummary(issueKey);
      // await upsource.renameReview({
      //   reviewId: review.reviewId,
      //   text: title,
      // });
      // const url = getJiraIssueUrl(issueKey);
      // await upsource.editReviewDescription({
      //   reviewId: review.reviewId,
      //   text: `[${title}](${url})`,
      // });
      break;
    }

    console.log(JSON.stringify({ review, revisions, responses, action }));
  },
});
