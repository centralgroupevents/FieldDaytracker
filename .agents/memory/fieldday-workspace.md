---
name: Fieldday workspace setup
description: Critical config quirks for running the Vite+React fieldday-tracker alongside a legacy Next.js root in the same repo
---

## The rule
This repo has a Next.js root (`package.json` with `tailwindcss@3`, `postcss.config.js`) alongside `artifacts/fieldday-tracker` (Tailwind v4 via `@tailwindcss/vite`). Three files must exist to keep them from colliding:

1. **`pnpm-workspace.yaml`** at repo root — lists `artifacts/*` and `lib/*` as workspace packages and defines `catalog:` entries for all shared dev-deps. Without it, `catalog:` references in fieldday-tracker/package.json fail with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`.

2. **`tsconfig.base.json`** at repo root — fieldday-tracker/tsconfig.json extends it. Vite warns but continues without it; however it causes a `TSConfckParseError` that can block dependency scanning.

3. **`css: { postcss: { plugins: [] } }`** in `artifacts/fieldday-tracker/vite.config.ts` — overrides PostCSS config resolution so the root `postcss.config.js` (which loads tailwindcss@3) is never applied to the Vite build. Without this, tailwindcss@3 processes the Tailwind v4 `@layer base` directive and throws a 500 error.

**Why:** The root postcss.config.js is picked up by Vite when it resolves PostCSS config upward from the artifact directory. Setting `css.postcss` inline in vite.config.ts takes precedence over file-based resolution.

**How to apply:** Whenever this artifact is rebuilt or the workspace is re-created, restore all three files above before running `pnpm install`.

## Artifact registration recovery
If `listArtifacts()` returns `[]` (platform removed registration):
1. `rm -rf artifacts/fieldday-tracker` (fast, node_modules symlinks resolve quickly)
2. `createArtifact({ artifactType: "react-vite", slug: "fieldday-tracker", previewPath: "/", title: "Field Day Tracker" })` → gets port 18915
3. Restore all source files from /tmp backup or re-write them
4. Workflow command: `PORT=18915 BASE_PATH=/ pnpm --filter @workspace/fieldday-tracker run dev`

## Key ports
- fieldday-tracker: 18915 (maps to external port 80 / preview pane)
- api-server: 8080 (console only)
- Vite proxy: `/api` → `http://localhost:8080`

## Node.js WebSocket fix (api-server)
Node 20 lacks native WebSocket for Supabase realtime. Pass `ws` package: `createClient(url, key, { realtime: { transport: ws as any } })`.
