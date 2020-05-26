import { parse, Args } from "https://deno.land/std/flags/mod.ts";
const { writeTextFileSync, chmodSync } = Deno;

export type GitArgs = Args;
export type GitHookName =
  | "applypatch-msg"
  | "pre-applypatch"
  | "post-applypatch"
  | "pre-commit"
  | "prepare-commit-msg"
  | "commit-msg"
  | "post-commit"
  | "pre-rebase"
  | "post-checkout"
  | "post-merge"
  | "pre-receive"
  | "update"
  | "post-receive"
  | "post-update"
  | "pre-auto-gc"
  | "post-rewrite"
  | "pre-push";

export type OptionalPromise = Promise<void> | void;
export type GitHookHandler = (args: GitArgs) => OptionalPromise;
export type GitHookHandlers = Partial<Record<GitHookName, GitHookHandler>>;
export class GitHooks {
  constructor(
    private readonly handlers: GitHookHandlers = {},
    private scriptPath = "./run.ts hooks",
  ) {}

  async run(args: Args): Promise<void> {
    const { _ } = args;
    if (_.length === 0) {
      this.updateHookFiles();
      return;
    }

    const name = _[0] as GitHookName;
    args._ = _.slice(1);

    const handle = this.handlers[name];
    if (!handle) {
      throw new Error(`Git hook "${name}" handle is undefined.`);
    }
    const result = handle(args);
    if (result instanceof Promise) {
      await result;
    }
  }

  private updateHookFiles(): void {
    (Object.keys(this.handlers) as GitHookName[]).forEach((name) =>
      this.updateHookFile(name)
    );
  }

  private updateHookFile(name: GitHookName): void {
    const path = `.git/hooks/${name}`;
    writeTextFileSync(
      path,
      ["#!/bin/sh", `${this.scriptPath} ${name} "$@"`, ""].join("\n"),
    );
    chmodSync(path, 0o755);
  }
}
