import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ExecSubCommand, Params } from "../ProxyRunner.ts";
import { ShCommands } from "../ProxyRunner.ts";
import { getAvailablePortSync } from "https://deno.land/x/port@1.0.0/mod.ts";

export type K8SParams = {
  finds?: string[];
  ports?: Record<number, number>;
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
  spec: {
    containers: {
      ports: {
        containerPort: number;
        name: string;
      }[];
    }[];
  };
}

const kubectlCommand = "kubectl";

export class K8SHandler extends ProxyHandler<IK8SProxy> {
  private lastArgument = "";

  getChainBase = () => [];
  getBase = () => [];
  getTty = (c: IK8SProxy) => this.kubectl(c);
  getEval = async (cs: ShCommands, c: IK8SProxy) => {
    if (cs.length === 0) {
      throw new Error("Specify some command for k8s.");
    }
    const head = cs[0];
    const tail = cs.slice(1);
    return this.kubectl(c, [head, tail.join(" ")]);
  };

  private kubectl = (c: IK8SProxy, args: ShCommands = []) => {
    return [
      kubectlCommand,
      ...this.getFlags(c),
      ...args,
    ];
  };

  suits = (c: IK8SProxy) => c.type === "k8s";

  enrichArgument = async (
    argument: string,
    c: IK8SProxy,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<string[]> => {
    let result = [argument];

    const p: K8SParams = params;

    if (this.lastArgument === kubectlCommand) {
      switch (argument) {
        case "e":
        case "exec":
          result = [
            "exec",
            "-it",
            c.pod,
            "--",
          ];
          break;
        case "pfa":
        case "port-forward-all":
          const fixed = (p && p.ports) || {};

          const pods = await this.getPods(exec, [c.pod]);
          const ports = pods[0].spec.containers.flatMap((c) =>
            c.ports.map((p) => p.containerPort)
          );
          result = [
            "port-forward",
            c.pod,
            ...ports
              .map((port) => [
                fixed[port] ?? getAvailablePortSync(),
                port,
              ])
              .map(([local, remote]) => `${local}:${remote}`),
          ];
          break;
      }
    }

    this.lastArgument = argument;

    return result;
  };

  private async getPods(
    exec: ExecSubCommand,
    commands: string[] = [],
  ): Promise<Pod[]> {
    const result = JSON.parse(
      await exec(["kubectl", "get", "pods", "--output", "json", ...commands]),
    );
    if (commands.some((c) => c.trim()[0] !== "-")) {
      return [result];
    }
    return result.items;
  }

  handleParams = async (
    c: IK8SProxy,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<boolean | void> => {
    if (c.pod) {
      return;
    }
    const p = params as K8SParams;
    if (!p) {
      return;
    }
    const getName = (pod: Pod) => pod.metadata.name;

    if (p.finds) {
      const { finds } = p;
      const pods = await this.getPods(exec);
      const runningPods = pods.filter((p) => p.status.phase === "Running");
      const foundPods = runningPods.filter((p) =>
        !finds.some((find) => getName(p).indexOf(find) === -1)
      );
      switch (foundPods.length) {
        case 1:
          c.pod = getName(foundPods[0]);
          break;
        default:
          throw new Error(
            `One pod expected by ${JSON.stringify(finds)} found: \n${
              JSON.stringify(foundPods.map(getName))
            }`,
          );
      }
    }

    if (!c.pod) {
      throw new Error("No pod criteria set up for K8S.");
    }
  };
}
