import { JSONValue, search } from "https://deno.land/x/jmespath/index.ts";
import { merge } from "../../deps.ts";
import { existsSync } from "./utils.ts";

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
  constructor(private file: JsonFile<any>) {
  }

  load(): object {
    return this.file.load();
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

export function load<T = any>(jsonPath: string): T {
  const l: ConfigLoader = new SearchConfigLoader(
    new MergeConfigLoader([
      new ArgConfigLoader("zored-deno"),
      new ArgConfigLoader("zored-deno-merge"),
    ]),
    jsonPath,
  );
  return l.load() as any as T;
}

export class JsonFile<T> {
  constructor(private path: string, private defaults: T) {
  }

  load(): T {
    if (!existsSync(this.path)) {
      this.save(this.defaults);
    }
    return JSON.parse(Deno.readTextFileSync(this.path));
  }

  save(t: T): void {
    Deno.writeTextFileSync(this.path, JSON.stringify(t));
  }

  map(f: (t: T) => T): T {
    const v = f(this.load());
    this.save(v);
    return v;
  }
}
