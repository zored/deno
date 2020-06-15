import { ProxyHandler } from "../ProxyHandler.ts";
import { IProxy } from "../IConfig.ts";

export interface IMongoProxy extends IProxy {
  type: "mongo";
  uri: string;
  slave?: boolean;
}
export class MongoHandler extends ProxyHandler<IMongoProxy> {
  private lastArgument: string = "";
  handle = (c: IMongoProxy) => ["mongo", c.uri, "--quiet"];
  suits = (c: IMongoProxy) => c.type === "mongo";
  enrichArgument = (a: string, c: IMongoProxy) => {
    if (c.slave !== true) {
      return a;
    }
    if (this.lastArgument === "--eval") {
      a = `rs.slaveOk(); ${a}`;
    }
    this.lastArgument = a;
    return a;
  };
  getEval = (command: string, p: IMongoProxy) => ["--eval", command];
}
