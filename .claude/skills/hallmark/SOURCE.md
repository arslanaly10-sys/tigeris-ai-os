# Source

Hallmark design skill v2.0.0 by Nutlope / Together AI, MIT licensed (see LICENSE).
Vendored unchanged from https://github.com/nutlope/hallmark, `skills/hallmark` at commit
4f6a46c6dc325d40ab268c93e25c7b96676ebccd (29 Oct 2026), so every session on this repository has it.

Nothing here runs on its own. Scripts run only when called: `scripts/imagegen.mjs` calls Together AI only when
`TOGETHER_API_KEY` is set, `scripts/theme.mjs` can download openly licensed photos, and `scripts/install-hook.mjs`
edits `.claude/settings.json` only when run. TIGERIS rules (CLAUDE.md) still apply to any page built with it:
self-hosted fonts, truth labels, no invented figures.

Update: re-copy `skills/hallmark` from a newer upstream commit and change the commit above.
