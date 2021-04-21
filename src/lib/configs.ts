import { JSONValue, search } from "https://deno.land/x/jmespath/index.ts";
import { merge } from "../../deps.ts";

interface ConfigLoader {
  load(): object;
}

class MergeConfigLoader implements ConfigLoader {
  constructor(private loaders: ConfigLoader[]) {
  }

  load(): object {
    return mergeAll(this.loaders.map((l) => l.load()));
  }
}

function mergeAll(a: object[]) {
  return a.reduce((o, l) => merge(o, l), {});
}

class JsonConfigLoader implements ConfigLoader {
  constructor(private path: string) {
  }

  load(): object {
    return JSON.parse(Deno.readTextFileSync(this.path));
  }
}

class SearchConfigLoader implements ConfigLoader {
  constructor(private l: ConfigLoader, private p: string = ".") {
  }

  load(): object {
    return search(this.l.load() as JSONValue, this.p) as object;
  }
}

class ArgConfigLoader implements ConfigLoader {
  constructor(private name = "zored-deno") {
  }
  load(): object {
    const prefix = `--${this.name}=`;
    return mergeAll(
      Deno.args
        .filter((a) => a.startsWith(prefix))
        .map((a) => a.substring(prefix.length))
        .map((s) => s.endsWith(".json") ? Deno.readTextFileSync(s) : s)
        .map((s) => JSON.parse(s)),
    );
  }
}

export function loadDefault(jsonPath: string): object {
  const l: ConfigLoader = new SearchConfigLoader(
    new MergeConfigLoader([
      new ArgConfigLoader("zored-deno"),
      new ArgConfigLoader("zored-deno-merge"),
    ]),
    jsonPath,
  );
  return l.load();
}
