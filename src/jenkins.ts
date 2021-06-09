#!/usr/bin/env deno run -A
import {
  Build,
  BuildAddress,
  JenkinsApiFactory,
  NodeAddress,
  QueueItem,
} from "./lib/jenkins.ts";
import { logJson, wait, withProgress } from "./lib/utils.ts";
import { QueryObject } from "./lib/url.ts";
import { Commands, shOpen } from "./lib/command.ts";
import { print } from "./lib/print.ts";

const api = new JenkinsApiFactory().create();

type Arg = number | string;
const parse = {
  path(v: Arg): string {
    return v + "";
  },
  job(v: Arg): string {
    if (!v) {
      throw new Error("Pass job argument!");
    }
    return v + "";
  },
  jobParams(v: Arg): QueryObject {
    return JSON.parse(v + "") as QueryObject;
  },
  buildId(v: Arg): number {
    return parseInt(v + "");
  },
  nodeId(v: Arg): number {
    return parseInt(v + "");
  },
  buildAddress(job: Arg, buildId: Arg): BuildAddress {
    return {
      job: this.job(job),
      buildId: this.buildId(buildId),
    };
  },
  nodeAddress(nodeId: Arg, build: BuildAddress): NodeAddress {
    return {
      nodeId: this.nodeId(nodeId),
      build,
    };
  },
};

async function waitBuild(
  buildAddress: BuildAddress,
  open = false,
): Promise<Build> {
  console.error(`Waiting for build ${JSON.stringify(buildAddress)}...`);
  let build: Build | undefined;
  await wait(withProgress(async () => {
    build = await api.getBuild(buildAddress);
    const done = !build.building;
    if (done) {
      return { done, percentInt: 100 };
    }
    const nodes = await api.getBuildNodes(buildAddress);
    const status = nodes.filter((n) => n.type === "STAGE").map((n) => {
      switch (n.state) {
        case "FINISHED":
          return "👍";
        case "RUNNING":
          return "🏃";
        case "NOT_BUILT":
          return "🙅";
        case "SKIPPED":
          return "⏩";
        case "FAILURE":
          return "⛔️";
        case "ABORTED":
          return "⏹";
        default:
          return "⏳";
      }
    }).join(" ");
    const duration = nodes.reduce((a, n) => a + n.durationInMillis, 0);
    await print("  " + status, Deno.stderr);
    const percentInt = Math.floor((duration / build.estimatedDuration) * 100);
    return { done, percentInt };
  }));
  if (!build) {
    throw new Error("Could not get build.");
  }

  if (open) {
    await shOpen(build.url);
  }
  return build;
}

await new Commands({
  build: async function ({ w = false, o = false, _: [j, jobParams] }) {
    const job = parse.job(j);
    const queueItemId = await api.buildWithParameters(
      job,
      parse.jobParams(jobParams),
    );
    let buildId: number | undefined = undefined;
    let queueItem: QueueItem | undefined = undefined;
    await wait(async () => {
      queueItem = await api.getQueueItem(queueItemId);
      buildId = queueItem?.executable?.number;
      return buildId !== undefined;
    });
    if (buildId === undefined) {
      throw new Error("No build number in queue!");
    }
    const buildAddress = { job, buildId };
    if (w) {
      await waitBuild(buildAddress, o);
    }
    logJson({ queueItem, build: await api.getBuild(buildAddress) });
  },
  async wait({ o = false, _: [job, buildId] }) {
    logJson(await waitBuild(parse.buildAddress(job, buildId), o));
  },
  async nodes({ _: [job, buildId] }) {
    logJson(await api.getBuildNodes(parse.buildAddress(job, buildId)));
  },
  async steps({ _: [nodeId, job, buildId] }) {
    logJson(await parse.nodeAddress(nodeId, parse.buildAddress(job, buildId)));
  },
  async log({ _: [nodeId, job, buildId] }) {
    console.log(
      await api.pipelineNodeLog(
        parse.nodeAddress(nodeId, parse.buildAddress(job, buildId)),
      ),
    );
  },
  async pipeline({ _: [job] }) {
    logJson(await api.pipelines(parse.job(job)));
  },
  async info({ _: [j, n] }) {
    const build = parse.buildAddress(j, n);
    logJson(
      await (build.buildId ? api.getBuild(build) : api.getLastBuild(build.job)),
    );
  },
  async fetch({ _: [path] }) {
    console.log(await (await api.fetch(parse.path(path))).text());
  },
}).runAndExit();
