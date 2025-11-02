# Commit Message Format

Write commits as a concise changelog + rationale. Keep messages readable from the CLI and informative in PRs. No emojis.

## Structure

<type>(<scope>): <short summary>

Context
- One or two sentences that state the problem or goal.

Changes
- Added: …
- Changed: …
- Fixed: …
- Removed: …
- Chore/Build/Docs: …

Decisions
- Rationale: why this approach.
- Alternatives considered: A vs B and why rejected.
- Trade‑offs: risks, follow‑ups, non‑goals.

Verification
- Commands: `npm run typecheck`, `npm run build`, manual steps to load `dist/` as an unpacked extension.
- QA: overlay backgrounds/z‑index, focus/visibility refresh, dark‑mode, keyboard shortcuts.
- Impacted areas: Dashboard | Side Panel | Background | Shared.

Permissions/Migration (if any)
- Manifest changes, data migrations, or user‑visible prompts.

Refs
- Issue/PR links, co‑authors, BREAKING‑CHANGE if applicable.

## Allowed types
- feat, fix, tweak, refactor, perf, chore, docs, test, build, ci, revert

## Allowed scopes (examples)
- dashboard, sidepanel, background, shared, ui, icons, docs

## Example

feat(sidepanel): shadcn Alert for stash results with dismiss + pluralization

Context
- The inline success text looked inconsistent and hard to scan.

Changes
- Added shadcn `Alert` for stash results; neutral style; button moved below with arrow.
- Added dismiss "X" with 200ms fade; plural/singular message.
- Truncated Side Panel titles and anchored tooltips to the link.

Decisions
- Use official shadcn components via CLI (no custom primitives).
- Keep neutral styling (not green) to align with shadcn defaults.

Verification
- `npm run typecheck` and `npm run build` pass.
- Loaded dist in Chrome; stashed from Side Panel; Dashboard updated instantly via runtime event.

Refs
- #123 (UI polish), docs/AGENTS.md overlay QA rules.
