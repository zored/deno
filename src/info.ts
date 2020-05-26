#!/usr/bin/env -S deno run --allow-read --allow-write
import { Info } from "./lib/info.ts";
new Info().updateFiles(Deno.args);
