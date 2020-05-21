#!/usr/bin/env -S deno run --allow-read
import {bold, red} from "https://deno.land/std@0.52.0/fmt/colors.ts"

async function main() {
    const [path] = Deno.args
    if (!path) {
        console.error(`Specify path.`)
        return
    }

    const issues = await new IssuesFactory().allByPath(path)
    const errorMessage = issues.join('\n').trim()
    if (errorMessage.length === 0) {
        return
    }

    console.log(`${red(`There are ${bold('multiline errors')} in code:`)}
${errorMessage}`)
    Deno.exit(1)
}

type Issues = Issue[]

class Issue {
    constructor(private file: string, private line: number, private text: string) {
    }

    toString() {
        return `${bold(this.file)}:${this.line}\n${this.text}`
    }
}

class IssuesFactory {
    private readonly decoder = new TextDecoder("utf-8")

    async allByPath(path: string, root: string = path): Promise<Issues> {
        const issues: Issues = []
        for await (const {name, isFile, isDirectory} of Deno.readDir(path)) {
            if (isFile) {
                const byFile = await this.byFile(path, name, root)
                issues.push(...byFile)
            }

            if (isDirectory) {
                const allByPath = await this.allByPath(`${path}/${name}`, root)
                issues.push(...allByPath)
            }
        }
        return issues
    }

    private async byFile(dir: string, name: string, root: string): Promise<Issue[]> {
        if (!name.match(/.go$/)) {
            return []
        }

        const filePath = `${dir}/${name}`
        const bytes = await Deno.readFile(filePath)
        const text = this.decoder.decode(bytes)

        const patternMultilineError = /^(\s*(var )?err :?= .{0,80}?(\n\s*)+if err != nil {\n+\s*return.*?\n\s*})/gm
        return this.match(filePath.replace(`${root}/`, ''), text, patternMultilineError)
    }

    private match(file: string, fullText: string, pattern: RegExp): Issue[] {
        return [...fullText.matchAll(pattern)].map(({1: text, index}) => new Issue(
            file,
            (fullText.substring(0, index).match(/\n/gm) || []).length + 1,
            text
        ))
    }
}

(async () => await main())()