import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";

export interface DockerConfig extends ProxyConfig {
  type: "docker";
  image: string;
}

export class DockerHandler extends ProxyHandler<DockerConfig> {
  getBase = (
    c: DockerConfig,
  ) => ["sudo", "docker", "run", "-it", "--net=host", "--rm", c.image];
  suits = (c: DockerConfig) => c.type === "docker";
}
