# Command line

Forma runs the same engines, job queue, validations and weights from the command line, without opening a window. Use it to automate generations, packages and checks.

```bash
# Development checkout
npm run cli -- <command> [options]

# Installed app
Forma --cli <command> [options]
```

On Windows the installed app is a windowed program, so pipe or redirect its output: `& "$env:LOCALAPPDATA\Programs\Forma\Forma.exe" --cli engines | Write-Output`, or `... --json > result.json`.

The command line and the app share one job queue and data folder (`FORMA_USER_DATA` selects another one). Close the Forma window first: while it is open, the command line exits with code 2.

## Commands

| Command | What it does |
| --- | --- |
| `engines` | Lists engines, whether they are ready and their tasks |
| `jobs` | Lists the 20 most recent jobs |
| `generate --engine <id> --image <file> --out <model.glb>` | Image to 3D. Multi-view engines take `--view front=<file>` (also `back`, `left`, `right`, `top`) instead of `--image` |
| `text-to-image --engine <id> --prompt <text> --out <folder>` | Saves every candidate image into the folder |
| `texture --engine <id> --model <model.glb> --image <file> --out <model.glb>` | Textures a model from a reference |
| `package --model <model.glb> [--lod <lod.glb>]... --target <blender\|unity\|godot> --out <folder> [--no-tangents]` | Writes a validated engine package, as **Export → Interchange** does |
| `validate <model.glb>` | Runs the Khronos glTF Validator; exits with 1 when there are errors |

Every job command accepts `--param <name>=<value>` (repeatable) with the engine parameters shown in the app, for example `--param steps=30 --param seed=7`. Values are validated against the engine manifest. Add `--json` for machine-readable output on stdout; progress goes to stderr.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The job or validation failed (the last lines of the engine log are printed) |
| 2 | Usage error, or Forma is open with the same data folder |

## Examples

```bash
npm run cli -- text-to-image --engine sdxl-lightning --prompt "a small wooden treasure chest" --param count=2 --out chest
npm run cli -- generate --engine hunyuan3d-2 --image chest/candidate-0.png --param steps=30 --out chest.glb
npm run cli -- texture --engine hunyuan3d-2-1-paint --model chest.glb --image chest/candidate-0.png --out chest-textured.glb
npm run cli -- package --model chest-textured.glb --target godot --out chest-godot
```

On an RTX 5070 (12 GB), the first command produced two 1024 px candidates in 82 s, including loading the model.
