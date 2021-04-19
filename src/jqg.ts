#!/usr/bin/env deno run -A
import { getStdinSync } from "https://deno.land/x/get_stdin@v1.1.0/mod.ts";

async function main() {
  const needle = Deno.args[0];
  console.log(JSON.stringify(
    JsonMatcher.match(
      JSON.parse(getStdinSync({ exitOnEnter: false })),
      [
        new JsonMatcher.ValueVisitor(new JsonMatcher.Contains(needle)),
        new JsonMatcher.KeyVisitor(new JsonMatcher.Contains(needle)),
      ],
    ),
  ));
}

namespace JsonMatcher {
  type Key = string | number;
  type Path = (Key)[];

  type Scalar = number | string | boolean;

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
    visit(v: any, p: Path): void;
  }

  interface MatchVisitor extends Visitor {
    getMatches(): Matches;
  }

  abstract class BaseVisitor implements Visitor {
    visit(v: any, p: Path): void {
      const t = typeof v;
      if (["number", "string", "boolean"].includes(t)) {
        this.visitScalar(v, p);
        return;
      }
      if (t === "object") {
        this.visitObject(v, p);
        return;
      }

      if (Array.isArray(v)) {
        this.visitArray(v, p);
        return;
      }

      throw new Error(`Undefined JSON value: ${JSON.stringify(v)}`);
    }

    protected abstract visitScalar(v: Scalar, p: Path): void;

    protected visitArray(v: any[], p: Path): void {
      v.forEach((k, vv) => this.visitKeyValue(vv, p, k));
    }

    protected visitObject(v: object, p: Path): void {
      Object.entries(v).forEach(([k, vv]) => this.visitKeyValue(vv, p, k));
    }

    protected visitKeyValue(vv: any, p: Path, k: Key): void {
      this.visit(vv, [...p, k]);
    }
  }

  interface Checker {
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

  export class ValueVisitor extends BaseVisitor implements MatchVisitor {
    constructor(
      private readonly checker: Checker,
      private readonly matches = new Matches("value"),
    ) {
      super();
    }

    getMatches = () => this.matches;

    protected visitScalar(v: Scalar, p: Path): void {
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

    protected visitScalar(v: Scalar, p: Path): void {
      this.matchPath(p, v);
    }

    protected visitObject(v: object, p: Path): void {
      this.matchPath(p, "{...}");
      super.visitObject(v, p);
    }

    protected visitArray(v: any[], p: Path): void {
      this.matchPath(p, "[...]");
      super.visitArray(v, p);
    }

    private matchPath(p: Path, vv: Scalar): void {
      const v = p.slice(-1)[0];
      if (v && this.checker.check(v)) {
        this.matches.add(p, vv);
      }
    }
  }

  function pathToString(p: Path): string {
    return "." +
      p.map((k) => Number.isNaN(parseInt(k + "")) ? k : `[${k}]`).join(".");
  }

  export function match(o: any, vs: MatchVisitor[]): Info[] {
    return vs.flatMap((v) => {
      v.visit(o, []);
      return v.getMatches().info();
    });
  }
}

await main();
