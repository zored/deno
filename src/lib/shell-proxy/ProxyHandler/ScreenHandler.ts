import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ShCommands } from "../ProxyRunner.ts";

export interface IScreenProxy extends ProxyConfig {
  type: "screen";
  name: string;
}

export class ScreenHandler extends ProxyHandler<IScreenProxy> {
  getBase = (c: IScreenProxy) => ["screen"];
  suits = (c: IScreenProxy) => c.type === "screen";
  getEval = async (
    cs: ShCommands,
    c: IScreenProxy,
  ) => ["screen", "-S", c.name, "-p", "0", "-X", "stuff", `${cs.join(" ")}^M`];
  getTty = (c: IScreenProxy) => ["-r", c.name];
}
