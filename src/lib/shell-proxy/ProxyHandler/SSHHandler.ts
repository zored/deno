import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";

export interface SSHConfig extends ProxyConfig {
  type: "ssh";
  sshAlias: string;
}

export class SSHHandler extends ProxyHandler<SSHConfig> {
  handle = (c: SSHConfig) => ["ssh", "-t", c.sshAlias];
  suits = (c: SSHConfig) => c.type === "ssh";
}
