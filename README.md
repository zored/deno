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
	https://raw.githubusercontent.com/zored/deno/v0.0.4/src/dep-check.ts \
	$PWD \
	$PWD/dep-check.json
```