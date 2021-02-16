import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ExecSubCommand, Params } from "../ProxyRunner.ts";

export type IK8SParams = {
  finds?: string[];
  names?: 1;
} | undefined;

export interface IK8SProxy extends ProxyConfig {
  type: "k8s";
  pod: string;
}

export interface Pod {
  status: {
    phase: "Running" | string;
  };
  metadata: {
    name: string;
  };
}
export class K8SHandler extends ProxyHandler<IK8SProxy> {
  private mode: "pod" | "logs" | "get" = "pod";

  getBase = (
    c: IK8SProxy,
  ) => ["kubectl", "exec", "-it", c.pod, "--"];
  suits = (c: IK8SProxy) => c.type === "k8s";
  getTty = () => ["sh"];

  handleParams = async (
    c: IK8SProxy,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<boolean | void> => {
    if (c.pod) {
      return;
    }
    const p = params as IK8SParams;
    if (p) {
      const getPods = async (): Promise<Pod[]> => {
        const output = await exec(["kubectl", "get", "pods", "-o", "json"]);
        return JSON.parse(output).items;
      };
      const getName = (pod: Pod) => pod.metadata.name;

      if (p.names) {
        console.log((await getPods()).map(getName).join("\n"));
        return true;
      } else if (p.finds) {
        const { finds } = p;
        const runningPods = (await getPods()).filter((p) =>
          p.status.phase === "Running"
        );
        const foundPods = runningPods.filter((p) =>
          !finds.some((find) => getName(p).indexOf(find) === -1)
        );
        switch (foundPods.length) {
          case 0:
            throw new Error(`No pods found by ${finds}.`);
          case 1:
            c.pod = getName(foundPods[0]);
            break;
          default:
            throw new Error(
              `Many pods found by ${finds}:\n${
                foundPods.map(getName).join("\n")
              }`,
            );
        }
      }

      if (!c.pod) {
        throw new Error("No pod criteria set up for K8S.");
      }
    }
  };
}
