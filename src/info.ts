#!/usr/bin/env deno run -A
import { Info } from "./lib/info.ts";

new Info().updateFiles(Deno.args);
