# raa-demo · self-review 1 (2026-10-10)

Stage-3 rehearsal of the `make-film` workflow (`.claude/skills/make-film/SKILL.md`) on a real product,
Repo-AI-Analysis (`E:\gitclone\Repo-AI-Analysis` at f98019e, its own dev server), with the engine unchanged by the
film. Made with: `new-film --plan`, `capture`, `plan-check`, `scaffold`, `narrate` (CosyVoice3), `fonts`, `validate`,
`sheet`, `music` (score.py), `mix`, `export`.

## Claims on screen and in the voice, checked

| Claim | Source | Result |
|---|---|---|
| A report scores ten dimensions | the radar on the home page (能力, 易用性, 性能, 代码质量, 文档, 社区, 成熟度, 可扩展性, 安全性, 推荐度) | 10 ✓ |
| Ollama 4.3, vLLM 4.2, llama.cpp 4.2 | `docs/public/data/reports.json`, `overall_score` | ✓ (also on screen in the recording) |
| 152 reports, 10 categories | `reports.json` (`count`, first path segment) and the home page's category list | ✓ |
| The selection is written into the URL and restored when shared | the Compare page's own text; `CompareView.vue` `syncUrlState` / `readUrlState`; the recording ends on `?repos=…ollama,…vllm,…llama-cpp` | ✓ |
| develata.me/Repo-AI-Analysis | `curl -L https://develata.github.io/Repo-AI-Analysis/` → 200 at `https://develata.me/Repo-AI-Analysis/` | ✓ |

Footage: real (Playwright recording of the running site), not sped up, nothing redrawn.

## Problems found and fixed in this round

1. The recording's three repo clicks missed: the rows were below the visible part of the scrolling list. The scenario
   now scrolls each row into view first and fails unless the URL holds the three repos.
2. The title plate's subtitle and the closing URL failed contrast (2.3:1 over the dawn highlight): larger backdrops,
   lower highlight. validate: 0 errors.
3. The home zoom cut the report card's header: camera target moved up.
4. Engine-side defects the rehearsal exposed (fixed in the engine, not in the film): the plan template's `main.ts` and
   scaffolded scenes did not type-check against a real plan; the JSON-schema freshness check failed on CRLF checkouts;
   the recorder's clock check could fire on a slow round trip (now bounded by the measured round-trip error); a film's
   scenario cannot import the scenario type (import boundary) — documented in the scenario file.

## Known limits

- The capture window in the paper-dawn layout shows the 1440x810 site at about 0.81x: fine for the radar, small for
  list text; the cameras zoom where it matters. A film that needs readable small UI text should record at a smaller
  viewport or zoom further.
- 46 s, shorter than the 60 s in the brief: the voice sets the length and the script is short; acceptable for a
  rehearsal.
- Each demo scene reports the clicks that belong to the other scene's part of the shared recording
  (`capture-event-cut` warnings): expected when one recording feeds two scenes.
