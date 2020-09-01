import { Api, ApiInfo } from "./lib/jenkins.ts";
// import { promptSecret } from "https://deno.land/x/prompts/mod.ts";
import { existsSync } from "https://deno.land/std/fs/mod.ts";
import { secrets } from "./rob-only-jenkins.ts";

const promptSecret = (message: string) =>
  new Promise<string>((r) => r(secrets.password));

const { job, jobParams, host, login, cookiePath, buildId, nodeId1, nodeId2 } =
  secrets;
const build = { job, buildId };

const main = async () => {
  switch (Deno.args[0]) {
    case "build":
      console.log(await api.buildWithParameters(job, jobParams));
      break;
    case "pipeline-nodes":
      console.log(JSON.stringify(await api.pipelineNodes(build)));
      break;
    case "pipeline-node-steps":
      console.log(
        JSON.stringify(await api.pipelineNodeSteps({ build, nodeId: nodeId1 })),
      );
      break;
    case "pipeline-node-log":
      console.log(
        JSON.stringify(await api.pipelineNodeLog({ build, nodeId: nodeId2 })),
      );
      break;
    case "pipeline":
      console.log(JSON.stringify(await api.pipelines(job)));
      break;
    default:
    case "info":
      console.log(JSON.stringify(await api.lastBuild(job)));
      break;
  }
};
const getInfo = async (): Promise<ApiInfo> => {
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

const api = new Api(await getInfo());
await main();
cookieFile(api.cookie);
