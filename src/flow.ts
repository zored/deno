#!/usr/bin/env deno run -A --unstable
import {
  BrowserClient,
  BrowserClientFactory,
  Build,
  CommandMap,
  History,
  IssueKey,
  JenkinsApi,
  JenkinsApiFactory,
  JenkinsConfig,
  JobName,
  print,
  runCommands,
  shOpen,
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
  RoleInReview,
  UpsourceError,
  UpsourceService,
  VoidMessage,
} from "./lib/upsource.ts";
import {
  debugLog,
  fromPairsArray,
  promiseRecord,
  sleepMs,
  wait,
} from "./lib/utils.ts";
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

function getJenkinsApi(c: JenkinsConfig): JenkinsApi {
  return new JenkinsApiFactory().create(c);
}

function getJenkins() {
  return new Jenkins();
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

function getIssueCacher() {
  return new IssueCacherFactory().create();
}

const automatedInfoField = "customfield_54419";
interface StatusIssue {
  key: string;
  developers: {
    name: string;
    displayName: string;
  }[];
  changelog: {
    histories: {
      items: {
        field: string;
      }[];
    }[];
  };
  fields: {
    lastViewed: string;
    assignee: {
      name: string;
      displayName: string;
    };
    summary: string;
    status: {
      name: string;
    };
    [automatedInfoField]: string;
    parent: {
      key: string;
      fields: {
        summary: string;
        status: { name: string };
      };
    };
    comment: {
      comments: {
        body: string;
      }[];
    };
  };
}
type BuildsByIssues = { issue: IssueKey; jobName: JobName; build: Build }[];

class Jenkins {
  constructor(
    private config = JenkinsConfig.load(),
    private api = getJenkinsApi(config),
  ) {
  }

  async getBuildsByIssues(issues: Set<IssueKey>): Promise<BuildsByIssues> {
    const ids = this.config.getJobIds();
    const buildsByIssuesByJobIndex = await Promise.all(
      ids.map(async (j) =>
        (await this.api.getJobDetails(j)).builds.reduce((r, b) => {
          let issue = "";
          b.actions.some((b) => {
            issue = b?.parameters?.find((p) => p.name === "Issue")?.value ?? "";
            return issue.length;
          });
          if (issues.has(issue) && !r[issue]) {
            r[issue] = b;
          }
          return r;
        }, {} as Record<IssueKey, Build>)
      ),
    );
    return ids.flatMap((jobName, jobIndex) =>
      Object
        .entries(buildsByIssuesByJobIndex[jobIndex])
        .map(([issue, build]) => ({ issue, jobName, build })), []);
  }
}

const commands = {
  async history({ i }: any) {
    const items = History.RepoFactory.create().list().reverse();
    const summaries = await getIssueCacher().all(
      items.map(([branch]) => branch),
    );

    const itemsWithSummaries = items.map((v) => {
      const [branch, dir] = v;
      const r: {
        branch: string;
        dir: string;
        summary?: string;
        dirName: string;
      } = {
        branch,
        dir,
        dirName: dir.split("/").slice(-1)[0],
      };
      const summary = summaries[branch];
      if (summary) {
        r.summary = summary;
      }
      return r;
    });

    if (i) {
      const item = await new CliSelect().select(
        itemsWithSummaries.map((v) => `${v.dirName}/${v.branch} ${v.summary}`),
        (o, i) => itemsWithSummaries[i],
      );
      if (!item) {
        throw new Error(`No item selected`);
      }
      console.log(JSON.stringify(item));
      return;
    }
    console.log(JSON.stringify(itemsWithSummaries));

    return;
  },
  async recent({ i, a, b, n }: any) {
    const refs = (await getGit().recentRefs()).slice(
      a || -Infinity,
      b || +Infinity,
    );
    const issues: string[] = [];
    const issueRefs: string[] = [];

    Object.entries(await getIssueCacher().all(refs)).forEach(
      ([ref, summary]) => {
        issues.push(`${ref} ${summary}`);
        issueRefs.push(ref);
      },
    );

    const all = (): string => issues.concat([""]).join("\n");
    const one = (i: number): string => issues[i];
    const interactive = async (): Promise<string> =>
      await new CliSelect().select(issues, (o, i) => issueRefs[i]);

    const output = (n ? await interactive() : ((i >= 0) ? one(i) : all()));

    await print(output);
  },

  async statusServe({ p = 8000, i = [] as string[] }) {
    console.log(`Listening: http://localhost:${p}/`);
    const c = serve({ port: p });
    for await (const req of c) {
      const { url } = req;
      const [, path, , query] = url.match(/^(.*?)(\?(.*))?$/) || [];

      console.error({ query });
      const queryObject = fromPairsArray(
        (query || "")
          .split("&")
          .map((v) => v.split("=", 2) as [string, string])
          .filter(([n]) => n.length),
      );

      let body: string | Uint8Array = "", status = 200;
      const headers: HeadersInit = { "content-type": "text/html" };

      switch (path) {
        case "/status":
          headers["content-type"] = "application/json";
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              console.error({ queryObject });
              body = JSON.stringify(
                await commands._getStatusInfo(queryObject.issue || []),
              );
              break;
            } catch (e) {
              const error = e instanceof Error ? e.message : JSON.stringify(e);
              console.error({ error, attempt });
              body = JSON.stringify({ error });
            }
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
          }).find(([k]) => k === path);
          if (file) {
            const [filePath, mime] = file;
            headers["content-type"] = mime;
            body = Deno.readFileSync(`src/flow/${filePath}`);
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
        true,
      ),
    ));
  },

  async _getStatusInfo(
    onlyIssueKeys: IssueKey[] = [],
    revert = false,
  ): Promise<any> {
    const gitlab = getGitlab(),
      jira = getJira(),
      upsourceApi = createUpsourceApi(),
      jenkins = getJenkins(),
      upsource = new UpsourceService(upsourceApi);

    const asyncResults = await promiseRecord({
      vcsRepoUrlByUpsourceProjectId: async () =>
        fromPairs(
          (await Promise.all(
            load<{ projectIds: string[] }>("upsource").projectIds.map(
              async (projectId) =>
                (await upsourceApi.getProjectVcsLinks({
                  projectId,
                })).result.repo.map((v) => [v.id, v.url[0]]),
            ),
          )).flatMap((v) => v),
        ),
      jiraIssueKeys: async () =>
        onlyIssueKeys.length ? [] : (await jira.findIssues({
          jql: BrowserClient.JQL_MY_UNRESOLVED_OR_ASSIGNED_TO_MERGE,
          fields: ["parent"],
        })).map((v: any) => v.key),
      reviewsWithRevisions: async () => {
        const reviews: Review[] = onlyIssueKeys.length
          ? (await upsource.getReviews({
            query: onlyIssueKeys.join(" or "),
          })).result.reviews || []
          : (await upsource.getAllMyReviews()).result.reviews || [];
        const revisionsForReview = await Promise.all(
          reviews.map((r) => upsourceApi.getRevisionsInReview(r.reviewId)),
        );
        return (zip(reviews, revisionsForReview) as [
          Review,
          Resulting<RevisionsInReviewResponse>,
        ][]).map(([review, revisions]) =>
          [
            review,
            revisions.result.allRevisions.revision,
          ] as [Review, RevisionInfo[]]
        );
      },
      myJiraName: async () => await jira.getCurrentUserName(),
      upsourceMyId: async () => await upsource.getMyId(),
    });

    const vcsRepoUrlByUpsourceProjectId: Record<string, string> =
      asyncResults.vcsRepoUrlByUpsourceProjectId;
    const jiraIssueKeys: IssueKey[] = asyncResults.jiraIssueKeys;
    const reviewsWithRevisions: [Review, RevisionInfo[]][] =
      asyncResults.reviewsWithRevisions;
    const myJiraName: string = asyncResults.myJiraName;
    const upsourceMyId: string = asyncResults.upsourceMyId;
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
      reviewsWithKeys.flatMap(([review, keys]) =>
        Array.from(keys).map((k) => [k, review] as [IssueKey, Review])
      ),
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
    const jenkinsBuilds = await jenkins.getBuildsByIssues(new Set(issueKeys));
    const statusConfig = load<
      { order: string[]; icons: Record<string, string> }
    >("jira.status");
    const statusPriorities = statusConfig.order.reduce(
      (o, status, index) => {
        o[status] = index + 1;
        return o;
      },
      {} as Record<string, number>,
    );
    const statusPriority = (t: any) =>
      statusPriorities[t.fields.status.name] ?? 0;
    const lastViewed = (a: StatusIssue): number =>
      (new Date(a.fields.lastViewed)).getTime();
    const lastDevOrAssignee = (f: StatusIssue) =>
      f.developers.length
        ? f.developers.slice(-1)[0].name
        : f.fields.assignee.name;
    const humanPriority = (t: any) =>
      lastDevOrAssignee(t) === myJiraName ? 0 : 1;
    const issues = (await Promise.all(
      issueKeys.map((key): Promise<StatusIssue> =>
        jira.getIssueFields(key, [
          "status",
          "summary",
          "parent",
          "lastViewed",
          "assignee",
          "comment",
          automatedInfoField,
        ], [
          "changelog",
        ]) as any
      ),
    ))
      .map((t: StatusIssue) => {
        t.developers = t.changelog.histories.flatMap((history) =>
          history.items
            .filter((item: any) =>
              ["Developer", "Работал"].includes(item.field)
            )
            .map((item: any) => ({
              name: item.to,
              displayName: item.toString,
            }))
        );
        return t;
      })
      .filter((t) => {
        if (t.fields.status.name !== "To Merge") {
          return true;
        }
        if (t.fields.assignee.name === myJiraName) {
          return true;
        }

        // I was developer:
        return t.developers.some((v: any) => v.name === myJiraName);
      })
      .sort((a, b) => {
        return (statusPriority(a) - statusPriority(b)) ||
          (humanPriority(a) - humanPriority(b)) ||
          (lastViewed(a) - lastViewed(b));
      });
    const pipelinesByKey = fromPairs(
      await Promise.all(
        issues.map(async (t) => {
          const key = t.key;
          const reviews = reviewsByKey[key] || [];
          const projects = [
            ...reviews
              .flatMap((r) =>
                projectIdsByReviewId[getStringReviewId(r.reviewId)] ??
                  []
              )
              .map((upsourceProjectId) =>
                vcsRepoUrlByUpsourceProjectId[upsourceProjectId]
              )
              .filter((v): v is string => !!v)
              .map((vcsRepoUrl) => getGitlabProjectFromVcsUrl(vcsRepoUrl)),
            ...(issues.find((t) => t.key === key)?.fields.comment.comments ||
              [])
              .flatMap((c) => gitlab.parseProjects(c.body + "")),
          ];

          return [
            key,
            (await Promise.all(
              projects
                .filter((p): p is string => p !== null)
                .reduce((a, p) => {
                  if (!a.includes(p)) {
                    a.push(p);
                  }
                  return a;
                }, [] as string[])
                .map((p) =>
                  gitlab.getPipelines(p, { ref: key, per_page: 1, page: 1 })
                ),
            ))
              .flat()
              .filter((v) => !!v.status)
              .map((v) => ({
                status: v.status,
                web_url: v.web_url,
              })),
          ];
        }),
      ),
    ) as Record<string, { status: string; web_url: string }[]>;
    const result = issues.map((t) => {
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
          [automatedInfoField]: automatedInfo,
        },

        developers,
      } = t;

      const assignee = t.fields?.assignee?.displayName;

      const statusIcon = statusConfig.icons[status];
      const issue: any = {
        key,
        summary,
        url: getJiraIssueUrl(key),
        status: (statusIcon ? `${statusIcon} ` : "") + status,
        assignee,

        developers: developers.map((v: any) => ({
          displayName: v.displayName,
          me: v.name === myJiraName,
        })),
      };

      if (automatedInfo && !automatedInfo.includes("Result: Success")) {
        issue.automatedError = automatedInfo;
      }

      if (parent) {
        issue.parent = parent;
      }

      const r: any = {
        issue,
        jenkinsBuilds: jenkinsBuilds
          .filter((b) => b.issue === key)
          .map((b) => b.build)
          .map((b) => ({ result: b.result, url: b.url })),
      };

      const reviews = reviewsByKey[key] || [];
      r.reviews = upsource.output(reviews, upsourceMyId);

      const pipelines = pipelinesByKey[key];
      if (pipelines) {
        r.pipelines = pipelines;
      }
      return [key, r];
    });
    return fromPairs(revert ? result.reverse() : result);
  },

  async waitPipeline({ o }: { o: boolean }) {
    const gitlab = getGitlab();
    const git = getGit();
    const project = getGitlabProjectFromVcsUrl(await git.getOriginUrl());
    if (!project) {
      throw new Error("no project found in git");
    }
    const ref = await git.getCurrentBranch();
    let url = "page:blank";
    await wait(async () => {
      const pipeline = await gitlab.getLastPipeline(project, ref);
      if (!pipeline) {
        throw new Error("no pipeline found");
      }
      url = pipeline.web_url;
      return ["success", "failed"].includes(pipeline.status);
    });

    if (o && url) {
      await shOpen(url);
    }
  },

  async putBranchReview({ w, i, h, p, o }: any) {
    const projectId = p ||
      load<{ projectIds: string[] }>("upsource").projectIds[0];
    const issueKey: string = i || await getGit().getCurrentBranch(),
      originUrl = (await getGit().getOriginUrl()),
      revisions = h
        ? (typeof h === "string" ? [h] : (Array.isArray(h) ? h : []))
        : (await getGit().getCurrentBranchHashes()),
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
      const reviews: Review[] = (await upsource.getReviews({
        limit: 100,
        query: `${issueKey} and state: open`,
      })).result.reviews || [];
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

      let reviewResponse: Resulting<Review>;
      const createReviewDto = {
        revisions,
        branch: `${issueKey}#${gitlabProject}`,
        projectId,
      };
      try {
        reviewResponse = await upsource.createReview(createReviewDto);
      } catch (e) {
        if (!(e instanceof UpsourceError)) {
          throw e;
        }
        console.error({ e, createReviewDto });
        await sleep();
        continue;
      }
      review = reviewResponse.result;
      responses = [review];
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
      console.error({ review });
      const unreachableRevisions =
        ((await upsource.getRevisionsInReview(review.reviewId))
          .result
          .allRevisions
          .revision || [])
          .filter((r) =>
            ![
              RevisionReachability.Reachable,
              // RevisionReachability.Unknown,
            ]
              .includes(r.reachability)
          );
      if (unreachableRevisions.length === 0) {
        break;
      }
      console.error({ unreachableRevisions });
      await sleep();
    }

    const reviewerIds = load<string[] | undefined>("upsource.defaultReviewers");
    if (reviewerIds && reviewerIds.length) {
      const { reviewId } = review;
      await Promise.all(
        reviewerIds.map((userId) => userId.substring(0, 36)).map((userId) =>
          upsource.addParticipantToReview({
            reviewId,
            participant: {
              userId,
              role: RoleInReview.Reviewer,
            },
          })
        ),
      );
    }

    console.log(JSON.stringify({ review, revisions, responses, action }));
    if (o) {
      await shOpen(upsource.getReviewUrl(review.reviewId));
    }
  },
};
await runCommands(commands as any as CommandMap);
