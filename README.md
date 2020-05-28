# deno
Here are my [deno](https://deno.land/) scripts.

## dep-check
Check dependencies.

Create `dep-check.json` for your Golang app:
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

And check dependencies:
```sh
deno run --allow-read \
	https://raw.githubusercontent.com/zored/deno/master/src/dep-check.ts \
	$PWD \
	$PWD/dep-check.json
```


### shell-completion
Autocomplete commands in SH.
```sh
deno install -f https://raw.githubusercontent.com/zored/deno/master/src/shell-completion.ts
eval "$(shell-completion completion --name=shell-completion)"

# Now completion works:
shell-completion sa<tab>
shell-completion sample ba<tab>
# ...
```

## go-lint
Lint Golang according to some advanced rules:
- Multiline errors.

```sh
deno run --allow-read \
	https://raw.githubusercontent.com/zored/deno/master/src/go-lint.ts \
	$PWD
```

## info
Retrieve info from one files into another.

Create `README.md`:
```md
# Description
<!-- info.ts.textFromXml(`README.md`, `//description[1]`) { -->
```

```sh

deno run --allow-read \
	https://raw.githubusercontent.com/zored/deno/master/src/info.ts \
	README.md
```