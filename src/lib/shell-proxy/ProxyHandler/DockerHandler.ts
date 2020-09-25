import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ShCommands } from "../ProxyRunner.ts";

export interface DockerConfig extends ProxyConfig {
  type: "docker";
  image: string;
  volumesHostGuest?: Record<string, string>;
}

export class DockerHandler extends ProxyHandler<DockerConfig> {
  getBase = (
    c: DockerConfig,
  ) => [
    "sudo",
    "docker",
    "run",
    "-it",
    "--net=host",
    "--rm",
    ...this.getVolumes(c),
    c.image,
  ];
  suits = (c: DockerConfig) => c.type === "docker";

  private getVolumes = (c: DockerConfig): ShCommands =>
    Object.entries(c.volumesHostGuest || {}).flatMap((
      [host, guest],
    ) => ["--volume", `${host}:${guest}`]);
}
