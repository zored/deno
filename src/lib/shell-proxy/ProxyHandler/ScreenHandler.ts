import { ProxyHandler } from "../ProxyHandler.ts";
import { ProxyConfig } from "../ProxyConfigs.ts";

export interface IScreenProxy extends ProxyConfig {
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
