#!/usr/bin/env deno run --allow-read --allow-write
import { Info } from "./lib/info.ts";
new Info().updateFiles(Deno.args);
