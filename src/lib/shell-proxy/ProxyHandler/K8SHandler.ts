import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";
import { ExecSubCommand, Params } from "../ProxyRunner.ts";

type IK8SParams =
  | {
    find?: string;
  }
  | "list"
  | undefined;

export interface IK8SProxy extends ProxyConfig {
  type: "k8s";
  pod: string;
}
export class K8SHandler extends ProxyHandler<IK8SProxy> {
  private mode: "pod" | "logs" | "get" = "pod";

  handle = (
    c: IK8SProxy,
  ) => ["kubectl", "exec", "-it", c.pod];
  suits = (c: IK8SProxy) => c.type === "k8s";
  getTty = () => ["sh"];

  handleParams = async (c: IK8SProxy, params: Params, exec: ExecSubCommand) => {
    if (c.pod) {
      return;
    }
    const p: IK8SParams | undefined = params[c.type];
    if (p) {
      const getPods = async (): Promise<any[]> => {
        const output = await exec(["kubectl", "get", "pods", "-o", "json"]);
        return JSON.parse(output).items;
      };
      const getName = (pod: any) => pod.metadata.name;

      switch (p) {
        case "list":
          const pods = await getPods();
          console.log(pods.map(getName));
          Deno.exit(0);
          break;
        case undefined:
          break;
        default:
          const { find } = p;
          if (find) {
            const pods = await getPods();
            const foundPods = pods.filter((p) =>
              getName(p).indexOf(find) === 0
            );
            switch (foundPods.length) {
              case 0:
                throw new Error(`No pods found by ${find}.`);
              case 1:
                c.pod = getName(foundPods[0]);
                break;
              case 2:
                throw new Error(
                  `Many pods found by ${find}: ${pods.map(getName).join("")}`,
                );
            }
          }
          break;
      }
    }

    if (!c.pod) {
      throw new Error("No pod criteria set up for K8S.");
    }
  };
}
