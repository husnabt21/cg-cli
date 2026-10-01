# cg-cli

A lightweight local CLI that builds a static code graph of a JavaScript/TypeScript
project, as the foundation for sending AI coding agents less code context.

**Status: Day 1 only** - indexing and inspection. No AI, retrieval or Claude
integration yet.

## Requirements

- Node.js 18 or newer

## Setup

```powershell
npm install
npm run build
npm link
```

`npm link` makes the `cg` command available everywhere. If PowerShell blocks it,
use `node dist/cli.js` instead of `cg` (for example `node dist/cli.js index`).

## Usage

Run these inside the JS/TS project you want to index:

```powershell
cg index
cg inspect <symbol>
```

- `cg index` scans `.js`, `.jsx`, `.ts`, `.tsx` files and writes `.cg/index.json`.
- `cg inspect <symbol>` prints the symbol's type, file, exact lines, direct
  relations and its source code.

If a name matches several symbols, use `file:name`, for example
`cg inspect src/routes/auth.ts:login`. Methods can be inspected as
`ClassName.method` or just `method`.

## Graph model

Nodes: `file`, `function`, `method`, `class`, `symbol`
Edges: `CONTAINS`, `IMPORTS`, `EXPORTS`, `CALLS`, `REFERENCES`

The index stores only names and line ranges, never source code. Source is read
from disk when you run `cg inspect`.

## Ignored paths

`.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`, `.cache`, `.cg`,
`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`

## Known limitations (Day 1 MVP)

- Calls are detected for `foo()`, `this.foo()` and `Name.foo()` only. Chains such
  as `this.service.run()` are skipped.
- Local variables that shadow a function name are not detected.
- Path aliases (for example `@/lib/x` from tsconfig) are treated as external packages.
- Names that cannot be resolved (`console`, `JSON`, ...) produce no edge on purpose.