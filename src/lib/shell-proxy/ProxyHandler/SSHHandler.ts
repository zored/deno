import { ProxyHandler } from "../ProxyHandler.ts";
import { IProxy } from "../IConfig.ts";

export interface ISSHProxy extends IProxy {
  type: "ssh";
  alias: string;
}

export class SSHHandler extends ProxyHandler<ISSHProxy> {
  handle = (c: ISSHProxy) => ["ssh", "-t", c.alias];
  suits = (c: ISSHProxy) => c.type === "ssh";
}
