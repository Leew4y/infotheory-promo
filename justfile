# Film engine · task runner (Windows host: recipes run in PowerShell; single commands only).
# Every film recipe takes the film id first (films/<id>/); the default below is the only place a film is named.
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

export UV_CACHE_DIR := justfile_directory() / ".cache" / "uv"

film := "infotheory"

default:
    @just --list

# Install JS dependencies (bun) and the Python audio environment (uv).
setup:
    bun install
    uv sync --project audio

# Start a new film from templates/film/, e.g. `just new-film demo nebula` (then `just fonts demo`).
new-film id style *args:
    bun scripts/new-film.ts {{id}} --style {{style}} {{args}}

# Generate the committed JSON schemas (Zod refinements are enforced by plan-check).
plan-schema:
    bun scripts/plan-schema.ts

# Check a plan before rendering: contracts, references, copy, assets and narration lock.
plan-check film=film *args:
    bun scripts/plan-check.ts --film {{film}} {{args}}

# Add missing plan scene modules and rewrite the index; keep existing scene modules.
scaffold film=film:
    bun scripts/scaffold.ts --film {{film}}

# Silent scene preview; stdout is one JSON summary, export logs go to stderr.
render-scene film scene *args:
    @just build {{film}} 1>&2
    @bun scripts/render.ts --film {{film}} --scene {{scene}} {{args}}

# Silent half-open time range in seconds (snapped to the frame grid).
render-range film from to *args:
    @just build {{film}} 1>&2
    @bun scripts/render.ts --film {{film}} --from {{from}} --to {{to}} {{args}}

# Plan end-to-end cases, including deliberate failures of every plan-check rule.
test-plan:
    bun scripts/test-plan.ts

# Start a new style package from templates/style/ (index.ts, shader.ts, fonts.json, STYLE.md), e.g. `just new-style ink-wash`.
new-style id:
    bun scripts/new-style.ts {{id}}

# Import a screen recording (OBS or any video) as capture <id> of a film: frames to .cache/captures/<film>/<id>/, manifest to films/<film>/captures/<id>.json. Paths are quoted (spaces are fine; a path containing an apostrophe needs the script run directly).
import-capture film id video *args:
    bun scripts/import-capture.ts --film {{film}} --id {{id}} {{quote(video)}} {{args}}

# Record a web demo with Playwright (scripts/lib/scenario.ts) as capture <id> of a film; the source video goes to out/<film>/sources/. Optional paths in the extra arguments (e.g. --sources) must not contain spaces here; run the script directly for those.
capture film id scenario *args:
    bun scripts/capture.ts --film {{film}} --id {{id}} {{quote(scenario)}} {{args}}

# Re-derive every capture of a film from its source videos (found by name in <dir>, checked by sha256).
captures film dir:
    bun scripts/import-capture.ts --film {{film}} --rebuild --from {{quote(dir)}}

# Live preview at http://127.0.0.1:5174 (space play/pause, arrows seek, [ ] scenes, , . frame step); ?style=<id> picks a style.
dev $FILM=film:
    bunx vite

# Build the film's page into dist/<film>/ (the tools serve it from there).
build $FILM=film:
    bunx vite build

# Write the film's font subsets per style (films/<film>/fonts/<style>/) from fonts/catalog.json; --style <id> for one.
fonts film=film *args:
    bun scripts/fonts.ts --film {{film}} {{args}}

# Download and verify every font of the shared library (fonts/catalog.json -> .cache/fonts); --lock records new entries.
font-catalog *args:
    bun scripts/font-catalog.ts {{args}}

# Type-check the engine, styles, films, templates and scripts.
check:
    bunx tsc --noEmit

# Enforce the dependency direction films -> styles -> engine (and no imports between films, between styles).
check-imports:
    bun scripts/check-imports.ts

# Check the built film in every style: schema, timeline, rendering, text inside the 5% safe area; --style <id> for one.
validate film=film *args: (build film)
    bun scripts/validate.ts --film {{film}} {{args}}

# Pixel regression of every style against films/<film>/regress/<style>.json (SwiftShader + CPU 2D canvas); --style <id> for one.
regress film=film *args: (build film)
    bun scripts/regress.ts --film {{film}} {{args}}

# Write the resolved timeline only (just cues writes it too).
timeline film=film: (build film)
    bun scripts/export.ts --film {{film}} --timeline

# Failure-mode tests of the exporter on a film with a score (missing/short audio, launch and encoder failure, interrupt, deadline, concurrency).
test-export film=film: (build film)
    bun scripts/test-export.ts --film {{film}}

# Unit tests (bun test: capture edit and geometry, ...).
test:
    bun test tests/

# End-to-end capture cases: a numbered video through import, a demo scene with an edit, the export, frame by frame.
test-capture:
    bun scripts/test-capture.ts

# Throughput and memory of capture scenes against the 0b budgets (a 60 s numbered capture vs the reference film's page scene).
bench-capture *args:
    bun scripts/bench-capture.ts {{args}}

# Cases for the layout checks of validate (a throwaway film from the template: clean, then with deliberate faults).
test-validate:
    bun scripts/test-validate.ts

# Contact sheet: the same representative moments in every style of the film (out/<film>/sheet/sheet.jpg + sheet.json); --style a,b, --times t1,t2.
sheet film=film *args: (build film)
    bun scripts/sheet.ts --film {{film}} {{args}}

# Print the scene list with times.
scenes film=film: (build film)
    bun scripts/export.ts --film {{film}} --scenes

# Write single frames for checking to out/<film>/shots/, e.g. `just shots infotheory 5,20.5,60` or `... 5,60 --style nebula`.
shots film=film times="0,10" *args: (build film)
    bun scripts/export.ts --film {{film}} --shots {{times}} {{args}}

# Dump the film's sound-effect cue sheet and resolved timeline to films/<film>/ (its score reads both).
cues film=film: (build film)
    bun scripts/export.ts --film {{film}} --cues --timeline

# Synthesize the film's score (films/<film>/score.py) -> out/<film>/music.wav (master), out/<film>/music.mp3 (preview).
music film=film: (cues film)
    uv run --project audio python films/{{film}}/score.py

# Synthesize the film's narration (films/<film>/narration.json) into films/<film>/narration/ and the lock; --resynth <ids|all>, --backend fake.
narrate film=film *args:
    bun scripts/narrate.ts --film {{film}} {{args}}

# Final mix: the music with the narration over it, ducked and mastered -> out/<film>/master.wav (the export uses it); --music <file|none>.
mix film=film *args: (build film)
    bun scripts/export.ts --film {{film}} --narration
    uv run --project audio python audio/mix.py --film {{film}} {{args}}

# Local text-to-speech (Fun-CosyVoice3-0.5B, pinned) into .cache/tts/: source, Python 3.10 environment, packages, model (~5.4 GB).
tts-setup:
    bun scripts/tts-setup.ts

# Narration end to end with the fake voice: timing, captions, anchors, the final mix's levels and loudness.
test-narration:
    bun scripts/test-narration.ts

# 1080p30 export -> out/<film>/<film>[-<style>].mp4, e.g. `just export demo 4 18 --noaudio --style nebula`.
export film=film workers="4" crf="18" *args: (build film)
    bun scripts/export.ts --film {{film}} --workers {{workers}} --crf {{crf}} {{args}}

# Everything for a film with a score: cues -> music -> final mix (with the narration, if any) -> video.
all film=film: (music film) (mix film) (export film)
