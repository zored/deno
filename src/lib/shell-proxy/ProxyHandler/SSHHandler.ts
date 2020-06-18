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

  getEval = async (
    cs: ShCommands,
    c: SSHConfig,
    exec: ExecSubCommand,
  ): Promise<ShCommands> => {
    switch (cs[0]) {
      case "mount":
        return this.mount(c, exec);
    }

    return this.ssh(c, cs);
  };

  getTty = (c: SSHConfig): ShCommands => this.ssh(c);

  handleParams = async (
    c: SSHConfig,
    params: Params,
    exec: ExecSubCommand,
  ) => exec(await this.mount(c, exec));

  private mount = async (
    c: SSHConfig,
    exec: ExecSubCommand,
  ): Promise<ShCommands> => {
    const hostGuests = Object.entries(c.volumesHostGuest || {});
    switch (hostGuests.length) {
      case 0:
        return [];
      case 1:
        break;
      default:
        throw new Error("Multiple SSH mounts are not supported yet.");
    }
    const [host, guest] = hostGuests[0];
    if (await this.mounted(host, exec)) {
      return [];
    }
    return ["sshfs", `${c.sshAlias}:${guest}`, host];
  };

  private ssh = (
    c: SSHConfig,
    cs: ShCommands = [],
  ) => ["ssh", "-t", c.sshAlias, ...cs];

  private mounted = async (
    hostPath: string,
    exec: ExecSubCommand,
  ): Promise<boolean> => {
    hostPath = hostPath.replace(/\/$/, "");
    return (await exec(["mount"]))
      .split("\n")
      .some((m) => m.indexOf(hostPath) >= 0);
  };
}
