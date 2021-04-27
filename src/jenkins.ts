#!/usr/bin/env deno run -A
import { JenkinsApi, JenkinsApiInfo } from "./lib/jenkins.ts";
import { load } from "./lib/configs.ts";
import { parse } from "../deps.ts";
import { existsSync } from "./lib/utils.ts";

const secrets = load<{
  job: string;
  jobParams: string;
  host: string;
  login: string;
  cookiePath: string;
  buildId: string;
  nodeId: string;
}>("jenkins");
const promptSecret = (message: string) =>
  new Promise<string>((r) => r(secrets.password));

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
const getInfo = async (): Promise<JenkinsApiInfo> => {
  const cookie = cookieFile();
  const password = cookie.length
    ? ""
    : await promptSecret("Enter password.") || "";
  return {
    host,
    password,
    cookie,
    login,
  };
};

const cookieFile = (cookie?: string): string => {
  if (cookie === undefined) {
    return existsSync(cookiePath) ? Deno.readTextFileSync(cookiePath) : "";
  }

  Deno.writeTextFileSync(cookiePath, cookie);
  return cookie;
};

const api = new JenkinsApi(await getInfo());
await main();
cookieFile(api.cookie);
