import { BasicAuthFetcher, Fetcher } from "./utils.ts";
import { load } from "./configs.ts";

export class KibanaApi {
  constructor(private host: string, private fetcher: Fetcher) {
  }

  async fetch(path: string, body: any | undefined) {
    console.error({ path });
    path = path.replace(/^\//, "");

    const init: RequestInit = {
      headers: {
        // 'kbn-xsrf': true,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    return await (await this.fetcher.fetch(
      `${this.host}/${path}`,
      init,
    )).json();
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
