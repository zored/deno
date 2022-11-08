import { serve } from "../../deps.ts";
import { debugLog } from "./utils.ts";

export class SessionStorageServer {
  async start(port: number, path: string) {
    try {
      await this._start(port, path);
    } catch (e) {
      debugLog({ i: "there was an error while session storage running", e });
    }
  }
  async _start(port: number, path: string) {
    if (!port) {
      throw new Error("specify port");
    }
    console.log(
      `Listening port ${port} for Jira cookies to save in ${path}...`,
    );
    for await (const request of serve({ port })) {
      const cookies = new TextDecoder().decode(
        await Deno.readAll(request.body),
      );

      const url = request.url;

      const matches = url.match(/siteId=(.+?)(&|$)/);
      if (!matches) {
        throw new Error(`siteId is not provided`);
      }
      const siteId = matches[1] as "jira" | "upsource";
      if (!["jira", "upsource"].includes(siteId)) {
        throw new Error(`siteId '${siteId}' is invalid`);
      }

      if (cookies.includes("[object Object]")) {
        continue;
      }

      const auth: {
        jira: { cookies: string };
        upsource: { authorization: string; cookies: string };
      } = JSON.parse(
        Deno.readTextFileSync(path),
      );
      switch (siteId) {
        case "upsource":
          auth.upsource.authorization = `Bearer ${cookies}`;
          break;
        default:
          auth.jira.cookies = cookies;
      }
      Deno.writeTextFileSync(path, JSON.stringify(auth));
      console.debug(`wrote '${siteId}' cookies`);

      request.respond({
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
        }),
        body: "ok",
      });
    }
  }
}
