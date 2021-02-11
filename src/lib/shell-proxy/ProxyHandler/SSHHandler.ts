import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ExecSubCommand, Params, ShCommands } from "../ProxyRunner.ts";

type HostGuest = [string, string];

export interface SSHConfig extends ProxyConfig {
  type: "ssh";
  sshAlias: string;
  volumesHostGuest?: Record<string, string>;
  command?: {
    before?: string;
    after?: string;
  };
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

    if (c.command?.before) {
      cs[0] = `${c.command?.before} && ${cs[0]}`;
    }
    if (c.command?.after) {
      cs[0] = `${cs[0]} && ${c.command?.after}`;
    }

    if (cs.length === 1) {
      const hostGuest = (this.hostGuests(c))[0];
      if (hostGuest) {
        cs[0] = `cd ${hostGuest[1]} && ${cs[0]}`;
      }
    }

    return this.ssh(c, cs);
  };

  getTty = (c: SSHConfig): ShCommands => this.ssh(c);

  handleParams = async (
    c: SSHConfig,
    params: Params,
    exec: ExecSubCommand,
  ) => {
    await exec(await this.mount(c, exec));
  };

  private hostGuests = (c: SSHConfig) =>
    Object.entries(c.volumesHostGuest || {});

  private mount = async (
    c: SSHConfig,
    exec: ExecSubCommand,
  ): Promise<ShCommands> => {
    const hostGuests = this.hostGuests(c);
    switch (hostGuests.length) {
      case 0:
        return [];
      case 1:
        break;
      default:
        throw new Error("Multiple SSH mounts are not supported yet.");
    }
    const hostGuest = hostGuests[0];
    const [host, guest] = hostGuest;
    if (await this.mounted(host, exec)) {
      return [];
    }
    await this.createDirs(c, exec, hostGuest);
    return ["sshfs", `${c.sshAlias}:${guest}`, host];
  };

  private createDirs = async (
    c: SSHConfig,
    exec: ExecSubCommand,
    [host, guest]: HostGuest,
  ) => {
    const mkdir = (dir: string): ShCommands => ["mkdir", "-p", dir];
    await exec(mkdir(host));
    await exec(this.ssh(c, mkdir(guest)));
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
