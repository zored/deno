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
  RevisionReachability,
  RevisionsInReviewResponse,
  UpsourceError,
  UpsourceService,
  VoidMessage,
} from "./lib/upsource.ts";
import { debugLog, fromPairsArray, sleepMs } from "./lib/utils.ts";
import { load } from "./lib/configs.ts";
import { fromPairs, zip } from "../deps.ts";
import { ConfigGitlabApiFactory, GitlabApi } from "./lib/gitlab.ts";
import { serve } from "https://deno.land/std@0.94.0/http/server.ts";

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

const commands = {
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

  async statusServe({ p = 8000 }) {
    console.log(`Listening: http://localhost:${p}/`);
    const c = serve({ port: p });
    for await (const req of c) {
      const { url } = req;
      let body: string | Uint8Array = "", status = 200;
      const headers: HeadersInit = { "content-type": "text/html" };

      switch (url) {
        case "/status":
          headers["content-type"] = "application/json";
          try {
            body = JSON.stringify(await commands._getStatusInfo());
          } catch (e) {
            const error = e instanceof Error ? e.message : JSON.stringify(e);
            console.error(error);
            body = JSON.stringify({ error });
          }
          break;
        case "/":
        case "":
          headers["location"] = "/index.htm";
          status = 308;
          break;
        default:
          const file = Object.entries({
            "/main.css": "text/css",
            "/main.js": "text/javascript",
            "/index.htm": "text/html",
          }).find(([k]) => k === url);
          if (file) {
            const [path, mime] = file;
            headers["content-type"] = mime;
            body = Deno.readFileSync(`src/flow/${path}`);
            break;
          }
          status = 404;
          body = "not found";
          break;
      }

      req.respond({ headers: new Headers(headers), body, status });
    }
  },

  async status({ i }: { i: string[] | string | undefined }): Promise<void> {
    console.log(JSON.stringify(
      await commands._getStatusInfo(
        (Array.isArray(i) ? i : [i]).filter((k) => !!k).map((k) => k + ""),
      ),
    ));
  },

  async _getStatusInfo(onlyIssueKeys: IssueKey[] = []): Promise<any> {
    const gitlab = getGitlab(),
      jira = getJira(),
      upsourceApi = createUpsourceApi(),
      upsource = new UpsourceService(upsourceApi);

    const vcsRepoUrlByUpsourceProjectId: Record<string, string> = fromPairs(
      (await upsourceApi.getProjectVcsLinks({
        projectId: load<{ projectId: string }>("upsource").projectId,
      })).result.repo.map((v) => [v.id, v.url[0]]),
    );

    const jiraIssueKeys: IssueKey[] = onlyIssueKeys.length
      ? []
      : (await jira.findIssues({
        jql: BrowserClient.JQL_MY_UNRESOLVED_OR_ASSIGNED_TO_MERGE,
        fields: ["parent"],
      })).map((v: any) => v.key);

    const filter: string =
      (onlyIssueKeys.length
        ? onlyIssueKeys.map((v) => `and ${v}`)
        : jiraIssueKeys.map((v) => `or ${v}`))
        .join(" ");
    const reviews =
      (await upsource.getAllMyReviews({ filter })).result.reviews || [];
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

    const myJiraName = await jira.getCurrentUserName();

    const issueKeys: IssueKey[] = onlyIssueKeys.length
      ? onlyIssueKeys
      : (await jira.findIssues({
        jql: [
          ...new Set<IssueKey>([
            ...jiraIssueKeys,
            ...reviewsWithKeys.flatMap(([, k]) => [...k]),
          ]),
        ].map((v) => `key = ${v}`).join(" OR "),
        fields: ["parent"],
      })).flatMap((v: any) =>
        debugLog([
          v.key,
          ...(v.fields && v.fields.parent ? [v.fields.parent.key] : []),
        ])
      );

    return fromPairs(
      await Promise.all(
        (await Promise.all(
          issueKeys.map((key) =>
            jira.getIssueFields(key, [
              "status",
              "summary",
              "parent",
              "lastViewed",
              "assignee",
              automatedInfoField,
            ], [
              "changelog",
            ])
          ),
        ))
          .filter((t) => {
            if (t.fields.status.name !== "To Merge") {
              return true;
            }
            if (t.fields.assignee.name === myJiraName) {
              return true;
            }

            // I was developer:
            return t.changelog.histories
              .some((v: any) =>
                v.items
                  .some((v: any) =>
                    v.field === "Develop" && v.to === myJiraName
                  )
              );
          })
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
                key,
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
              key,
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
            return [key, r];
          }),
      ),
    );
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

    const sleep = () => sleepMs(10000);

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
        await sleep();
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
        await sleep();
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

    while (true) {
      const unreachableRevisions =
        (await upsource.getRevisionsInReview(review.reviewId))
          .result
          .allRevisions
          .revision
          .filter((r) => r.reachability !== RevisionReachability.Reachable);
      if (unreachableRevisions.length === 0) {
        break;
      }
      console.error({ unreachableRevisions });
      await sleep();
    }

    console.log(JSON.stringify({ review, revisions, responses, action }));
  },
};
await runCommands(commands);
