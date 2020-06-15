import { ProxyHandler } from "../ProxyHandler.ts";
import { IProxy } from "../IConfig.ts";

export interface IScreenProxy extends IProxy {
  type: "screen";
  name: string;
}

export class ScreenHandler extends ProxyHandler<IScreenProxy> {
  handle = (c: IScreenProxy) => ["screen"];
  suits = (c: IScreenProxy) => c.type === "screen";
  getEval = (
    command: string,
    c: IScreenProxy,
  ) => ["screen", "-S", c.name, "-p", "0", "-X", "stuff", `${command}^M`];
  getTty = (c: IScreenProxy) => ["-r", c.name];
}
