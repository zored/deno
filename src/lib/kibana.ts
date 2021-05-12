import { BasicAuthFetcher, Fetcher, parseJson } from "./utils.ts";
import { load } from "./configs.ts";

export class KibanaApi {
  constructor(private host: string, private fetcher: Fetcher) {
  }

  async fetch(
    path: string,
    body: any | undefined,
    method = "GET",
    type = "json",
  ) {
    path = path.replace(/^\//, "");

    const headers = new Headers({
      "Content-Type": "application/json",
      "kbn-xsrf": "true",
    });
    const init: RequestInit = {
      headers,
      method: "POST",
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.method = "POST";
    }
    const text = await (await this.fetcher.fetch(
      `${this.host}/api/console/proxy?path=${path}&method=${method}`,
      init,
    )).text();
    switch (type) {
      case "json":
        return parseJson(text);
      case "text":
        return text;
    }
    throw new Error(`Unknown fetch type ${type}`);
  }
}

export class KibanaApiFactory {
  create(): KibanaApi {
    const c = load<{ host: string; cookiePath: string; login: string }>(
      "kibana",
    );
    return new KibanaApi(
      c.host,
      new BasicAuthFetcher(c.cookiePath, c.login, "kibana_password"),
    );
  }
}
