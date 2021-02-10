import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ShCommands } from "../ProxyRunner.ts";

export interface PostgresConfig extends ProxyConfig {
  type: "postgres";
  uri: string;
  slave?: boolean;
}

export class PostgresHandler extends ProxyHandler<PostgresConfig> {
  suits = (c: PostgresConfig) => c.type === "postgres";

  getChainBase = () => [];
  getBase = () => [];
  getTty = (c: PostgresConfig) => this.psql(c);
  getEval = async (cs: ShCommands, c: PostgresConfig) => {
    return this.psql(c, ["--command", cs.join(" ")]);
  };

  private psql = (
    c: PostgresConfig,
    args: ShCommands = [],
  ) => ["psql", c.uri, "--quiet", ...this.getFlags(c), ...args];
}
