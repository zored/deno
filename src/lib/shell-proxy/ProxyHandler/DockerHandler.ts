import { ProxyHandler } from "../ProxyHandler.ts";
import { IProxy } from "../IConfig.ts";

export interface IDockerProxy extends IProxy {
  type: "docker";
  image: string;
}

export class DockerHandler extends ProxyHandler<IDockerProxy> {
  handle = (
    c: IDockerProxy,
  ) => ["sudo", "docker", "run", "-it", "--net=host", "--rm", c.image];
  suits = (c: IDockerProxy) => c.type === "docker";
}
