#!/usr/bin/env deno run -A
import { getStdinSync } from "https://deno.land/x/get_stdin@v1.1.0/mod.ts";
import { parse } from "../deps.ts";
import {
  Checker,
  Contains,
  KeyVisitor,
  match,
  Regexp,
  ValueVisitor,
} from "./lib/jqg.ts";

const a: {
  insensitive: boolean;
  keys: boolean;
  values: boolean;
  text: boolean;
  contains?: string;
  regexp?: string;
  _: string[];
} = parse(Deno.args, {
  boolean: [
    "insensitive",
    "keys",
    "values",
    "text",
  ],
  alias: {
    "insensitive": ["i"],
    "contains": ["c"],
    "regexp": ["r"],
    "keys": ["k"],
    "values": ["v"],
    "text": ["t"],
  },
  string: [
    "contains",
    "regexp",
  ],
}) as any;

// Checkers:
const checkers: Checker[] = [];
const insensitive = a.insensitive ?? false;
const contains = a.contains ?? a._[0];
if (contains !== undefined) {
  checkers.push(new Contains(contains, insensitive));
}
if (a.regexp !== undefined) {
  checkers.push(
    new Regexp(new RegExp(a.regexp, insensitive ? "i" : "")),
  );
}
if (checkers.length === 0) {
  throw new Error("Specify --contains or --regexp!");
}

// Visitors:
if (!a.keys && !a.values) {
  a.values = true;
}
const info = await match(
  JSON.parse(getStdinSync({ exitOnEnter: false })),
  checkers.flatMap((c) =>
    [
      a.keys ? [new KeyVisitor(c)] : [],
      a.values ? [new ValueVisitor(c)] : [],
    ].flat()
  ),
);

if (a.text) {
  console.log(
    info.map((v: any) => `${v.type[0]} ${v.path} ${v.value}`).join("\n"),
  );
  return;
}
console.log(JSON.stringify(info));
