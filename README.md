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
	https://raw.githubusercontent.com/zored/deno/v0.0.5/src/dep-check.ts \
	$PWD \
	$PWD/dep-check.json
```

## go-lint
Lint Golang according to some advanced rules:
- Multiline errors.

```sh
deno run --allow-read \
	https://raw.githubusercontent.com/zored/deno/v0.0.5/src/go-lint.ts \
	$PWD
```
