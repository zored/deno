#!/usr/bin/env deno run -A
import { getStdinSync } from "https://deno.land/x/get_stdin@v1.1.0/mod.ts";
import { parse } from "../deps.ts";

async function main() {
  const a: {
    insensitive: boolean;
    keys: boolean;
    values: boolean;
    contains?: string;
    regexp?: string;
    _: string[];
  } = parse(Deno.args, {
    boolean: [
      "insensitive",
      "keys",
      "values",
    ],
    alias: {
      "insensitive": ["i"],
      "contains": ["c"],
      "regexp": ["r"],
      "keys": ["k"],
      "values": ["v"],
    },
    string: [
      "contains",
      "regexp",
    ],
  }) as any;

  // Checkers:
  const checkers: JsonMatcher.Checker[] = [];
  const insensitive = a.insensitive ?? false;
  const contains = a.contains ?? a._[0];
  if (contains !== undefined) {
    checkers.push(new JsonMatcher.Contains(contains, insensitive));
  }
  if (a.regexp !== undefined) {
    checkers.push(
      new JsonMatcher.Regexp(new RegExp(a.regexp, insensitive ? "i" : "")),
    );
  }
  if (checkers.length === 0) {
    throw new Error("Specify --contains or --regexp!");
  }

  // Visitors:
  if (!a.keys && !a.values) {
    a.values = true;
  }
  console.log(JSON.stringify(
    await JsonMatcher.match(
      JSON.parse(getStdinSync({ exitOnEnter: false })),
      checkers.flatMap((c) =>
        [
          a.keys ? [new JsonMatcher.KeyVisitor(c)] : [],
          a.values ? [new JsonMatcher.ValueVisitor(c)] : [],
        ].flat()
      ),
    ),
  ));
}

namespace JsonMatcher {
  type Key = string | number;
  type Path = (Key)[];

  type Scalar = number | string | boolean | undefined | null;

  interface Info {
    path: string;
    type: string;
    value: Scalar;
  }

  class Matches {
    private all: [Path, Scalar][] = [];

    constructor(private name: string) {
    }

    add(p: Path, v: Scalar): void {
      this.all.push([p, v]);
    }

    info(): Info[] {
      return this.all.map(([p, value]) => ({
        path: pathToString(p),
        type: this.name,
        value,
      }));
    }
  }

  interface Visitor {
    visit(v: any, p: Path): Promise<void>;
  }

  export interface MatchVisitor extends Visitor {
    getMatches(): Matches;
  }

  abstract class BaseVisitor implements Visitor {
    async visit(v: any, p: Path): Promise<void> {
      const t = typeof v;
      if (
        ["number", "string", "boolean"].includes(t) || v === undefined ||
        v === null
      ) {
        await this.visitScalar(v, p);
        return;
      }

      if (t === "object") {
        await this.visitObject(v, p);
        return;
      }

      if (Array.isArray(v)) {
        await this.visitArray(v, p);
        return;
      }

      throw new Error(`Undefined JSON value: ${JSON.stringify(v)}`);
    }

    protected abstract visitScalar(v: Scalar, p: Path): Promise<void>;

    protected async visitArray(v: any[], p: Path): Promise<void> {
      await Promise.all(v.map((k, vv) => this.visitKeyValue(vv, p, k)));
    }

    protected async visitObject(v: object, p: Path): Promise<void> {
      await Promise.all(
        Object.entries(v).map(([k, vv]) => this.visitKeyValue(vv, p, k)),
      );
    }

    protected async visitKeyValue(vv: any, p: Path, k: Key): Promise<void> {
      return this.visit(vv, [...p, k]);
    }
  }

  export interface Checker {
    check(v: Scalar): boolean;
  }

  export class Contains implements Checker {
    constructor(
      private readonly needle: string,
      private readonly insensitive = false,
    ) {
      this.needle = this.withCase(this.needle);
    }

    check = (v: Scalar) => this.withCase(v + "").includes(this.needle);

    private withCase = (s: string) => this.insensitive ? s.toLowerCase() : s;
  }

  export class Regexp implements Checker {
    constructor(private readonly r: RegExp) {}

    check = (v: Scalar) => this.r.test(v + "");
  }

  export class ValueVisitor extends BaseVisitor implements MatchVisitor {
    constructor(
      private readonly checker: Checker,
      private readonly matches = new Matches("value"),
    ) {
      super();
    }

    getMatches = () => this.matches;

    protected async visitScalar(v: Scalar, p: Path): Promise<void> {
      if (!this.checker.check(v)) {
        return;
      }
      this.matches.add(p, v);
    }
  }

  export class KeyVisitor extends BaseVisitor implements MatchVisitor {
    constructor(
      private readonly checker: Checker,
      private readonly matches = new Matches("key"),
    ) {
      super();
    }

    getMatches = () => this.matches;

    protected async visitScalar(v: Scalar, p: Path): Promise<void> {
      this.matchPath(p, v);
    }

    protected async visitObject(v: object, p: Path): Promise<void> {
      this.matchPath(p, "{...}");
      return super.visitObject(v, p);
    }

    protected async visitArray(v: any[], p: Path): Promise<void> {
      this.matchPath(p, "[...]");
      return super.visitArray(v, p);
    }

    private matchPath(p: Path, vv: Scalar): void {
      const v = p.slice(-1)[0];
      if (v && this.checker.check(v)) {
        this.matches.add(p, vv);
      }
    }
  }

  function pathToString(p: Path): string {
    return p.map((k) => Number.isNaN(parseInt(k + "")) ? `.${k}` : `[${k}]`)
      .join("");
  }

  export async function match(o: any, vs: MatchVisitor[]): Promise<Info[]> {
    return (await Promise.all(vs.map((v) => {
      v.visit(o, []);
      return v;
    }))).flatMap((v) => v.getMatches().info());
  }
}

await main();
