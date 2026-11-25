# AGENTS.md

eisenhower-matrix-crucible shows a to-do list as a forge fire sorted by the Eisenhower matrix. Part of the entropy forge **crucible** family (crucible = a tool that shows information; brazers sync data). See README.md.

## Rules

- **Never commit anyone's items.** `items.js`, `items.json` and `config.js` are git-ignored and must stay that way. Use `sample-items.js` (made-up items) in examples, tests and screenshots.
- The page has no build step and no runtime dependencies. Don't add a framework, bundler or SDK. AWS calls go through `lib/aws.mjs`.
- Render data from any source as text: escape it or use `textContent`. Links must be `http`/`https`.
- The data format is `schema/crucible.schema.json`. A change to it must update `scripts/validate.mjs`, its tests, README.md and the crucible-items skill together, and stay readable by task-brazer.
- Per-user access is enforced by IAM in `infra/` (session tag `email` from the ID token). Never widen the reader role beyond the caller's own board.
- Styling follows Afterglow (content-forge `design-system/content-forge/MASTER.md`) with the forge heat palette. Aeonik is licensed: never bundle it or load it from the web.
- `npm test` before every commit. If you change `infra/`, `npx tsc --noEmit` and `npx cdk synth -c domainPrefix=x` in `infra/` too.
- Motion runs once and never loops; honor `prefers-reduced-motion`.

## Generating items

Use the `crucible-items` skill (`.claude/skills/crucible-items/SKILL.md`). Agents without skill support should follow that file directly.
