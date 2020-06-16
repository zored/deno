import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";

export interface MongoConfig extends ProxyConfig {
  type: "mongo";
  uri: string;
  slave?: boolean;
}
export class MongoHandler extends ProxyHandler<MongoConfig> {
  private lastArgument: string = "";
  handle = (c: MongoConfig) => ["mongo", c.uri, "--quiet"];
  suits = (c: MongoConfig) => c.type === "mongo";
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
  getEval = (command: string, p: MongoConfig) => ["--eval", command];
}
