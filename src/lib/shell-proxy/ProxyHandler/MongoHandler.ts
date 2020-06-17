import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";
import { ShCommands } from "../ProxyRunner.ts";

export interface MongoConfig extends ProxyConfig {
  type: "mongo";
  uri: string;
  slave?: boolean;
}

export class MongoHandler extends ProxyHandler<MongoConfig> {
  private lastArgument: string = "";
  suits = (c: MongoConfig) => c.type === "mongo";

  getChainBase = () => [];
  getBase = () => [];
  getTty = (c: MongoConfig) => this.mongo(c);
  getEval = (cs: ShCommands, c: MongoConfig): ShCommands => {
    const first = cs[0];
    switch (first) {
      case "dump":
      case "restore":
      case "export":
      case "import":
        const args = cs.slice(1);
        switch (first) {
          case "dump":
          case "restore":
            args.unshift("--gzip");
            break;
        }
        return [`mongo${first}`, "--uri", c.uri, "--quiet", ...args];
    }
    return this.mongo(c, ["--eval", cs.join(" ")]);
  };

  enrichArgument = (a: string, c: MongoConfig) => {
    if (c.slave !== true) {
      return a;
    }
    if (this.lastArgument === "--eval") {
      a = `rs.slaveOk(); ${a}`;
    }
    this.lastArgument = a;
    return a;
  };

  private mongo = (
    c: MongoConfig,
    args: ShCommands = [],
  ) => ["mongo", c.uri, "--quiet", ...this.getFlags(c), ...args];
}
