# deno
Here are my [Deno](https://deno.land/) scripts:
- [chromedriver-check](#chromedriver-check)
- [debug-http](#debug-http)
- [dep-check](#dep-check)
- [file-edit](#file-edit)
- [flow](#flow)
- [git](#git)
- [go-lint](#go-lint)
- [info](#info)
- [jira](#jira)
- [shell-completion](#shell-completion)

In your Deno code you may use my [`lib`](./src/lib) direactory.

## chromedriver-check
Check that chromedriver has the same version with browser.

## debug-http
Run this to debug any HTTP-requests.

## dep-check
Check dependencies in your architecture.

Supported languages:
- Golang.
- Kotlin.

Ussage:
- Create `dep-check.json` for your app:
    ```json
    {
        "layers": {
            "ddd": [
                [
                    "app/src/http",
                    "app/src/cli"
                ],
                    "app/src/service",
                [
                    "app/src/domain",
                    "app/src/utils"
                ]
            ]
        }
    }
    ```
- Check dependencies:
    ```sh
    deno run --allow-read \
        https://raw.githubusercontent.com/zored/deno/v0.0.36/src/dep-check.ts \
            $PWD \
            $PWD/dep-check.json
    ```

## file-edit
Some simple edits for your file.
- Rename file by cursor word.
- Paste file name as word.
- Paste new lines between Golang functions.

## flow
Connects [git](#git) and [jira](#git). Retrieves recent branches for issues.

## git
Useful git actions.
- Recent branches.
- Increment and push tag version:

Example (increments minor version with prefix `v`):
```sh
deno run --allow-run --allow-read \
    https://raw.githubusercontent.com/zored/deno/v0.0.36/src/git.ts \
	    incVer
```

## info
Retrieve info from one files into another.

Example:
- Create source `some.xml`:
    ```xml
    <description>new text</description>
    ```
- Create `README.md`:
    ```md
    # Description
    <!-- info.ts.textFromXml(`some.xml`, `//description[1]`) { -->
    old text
    <!-- } -->
    ```
- Run:
    ```sh
    deno run --allow-read --allow-write \
        https://raw.githubusercontent.com/zored/deno/v0.0.36/src/info.ts \
            README.md
    ```

## jira
Some Jira actions.
- Cache and retrieve Jira issue names.

## shell-completion
Autocomplete commands in SH.

Example:
```sh
deno install -f https://raw.githubusercontent.com/zored/deno/v0.0.36/src/shell-completion.ts
eval "$(shell-completion completion --name=shell-completion)"

# Now completion works:
shell-completion sa<tab>
shell-completion sample ba<tab>
# ...
```

## go-lint
Lint Golang according to some advanced rules:
- Multiline errors.

Example:
```sh
deno run --allow-read \
    https://raw.githubusercontent.com/zored/deno/v0.0.36/src/go-lint.ts \
        $PWD
```