import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";
import { ExecSubCommand, Params, ShCommands } from "../ProxyRunner.ts";

export interface SSHConfig extends ProxyConfig {
  type: "ssh";
  sshAlias: string;
  volumesHostGuest?: Record<string, string>;
}

export class SSHHandler extends ProxyHandler<SSHConfig> {
  getChainBase(c: SSHConfig, last: boolean): ShCommands {
    return last ? [] : super.getChainBase(c, last);
  }

  getBase = (c: SSHConfig) => this.ssh(c);

  suits = (c: SSHConfig) => c.type === "ssh";

  getEval = (cs: ShCommands, c: SSHConfig): ShCommands => {
    switch (cs[0]) {
      case "mount":
        return this.mount(c);
    }

    return this.ssh(c, cs);
  };

  getTty = (c: SSHConfig): ShCommands => this.ssh(c);

  handleParams = (
    c: SSHConfig,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<any> => exec(this.mount(c));

  private mount = (c: SSHConfig): ShCommands =>
    Object
      .entries(c.volumesHostGuest || {})
      .slice(0, 1)
      .flatMap(([host, guest]) => ["sshfs", `${c.sshAlias}:${guest}`, host]);

  private ssh = (
    c: SSHConfig,
    cs: ShCommands = [],
  ) => ["ssh", "-t", c.sshAlias, ...cs];
}
