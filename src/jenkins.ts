#!/usr/bin/env deno run -A
import { JenkinsApi, JenkinsApiInfo } from "./lib/jenkins.ts";
import { load } from "./lib/configs.ts";
import { parse } from "../deps.ts";
import { BasicAuthFetcher, existsSync } from "./lib/utils.ts";

const secrets = load<{
  job: string;
  jobParams: string;
  host: string;
  login: string;
  cookiePath: string;
  buildId: string;
  nodeId: string;
}>("jenkins");

const { job, jobParams, host, login, cookiePath, buildId, nodeId } = secrets;

const build = { job, buildId };

const main = async () => {
  switch (parse(Deno.args)._[0]) {
    case "build":
      const queueItemId = await api.buildWithParameters(job, jobParams);
      console.log(await api.getQueueItem(queueItemId));
      break;
    case "pipeline-nodes":
      console.log(JSON.stringify(await api.pipelineNodes(build)));
      break;
    case "pipeline-node-steps":
      console.log(
        JSON.stringify(await api.pipelineNodeSteps({ build, nodeId })),
      );
      break;
    case "pipeline-node-log":
      console.log(
        await api.pipelineNodeLog({
          build,
          nodeId,
        }),
      );
      break;
    case "pipeline":
      console.log(JSON.stringify(await api.pipelines(job)));
      break;
    default:
    case "info":
      const number = parseInt(Deno.args[1]);
      console.log(
        JSON.stringify(
          await (number ? api.getBuild(job, number) : api.lastBuild(job)),
        ),
      );
      break;
  }
};

const api = new JenkinsApi(
  { host, login },
  new BasicAuthFetcher(cookiePath, login, "jenkins_password"),
);
await main();
