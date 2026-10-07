# 信息论宣传片 · task runner (Windows host: recipes run in PowerShell; single commands only).
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

export UV_CACHE_DIR := justfile_directory() / ".cache" / "uv"

default:
    @just --list

# Install JS dependencies (bun) and the Python audio environment (uv).
setup:
    bun install
    uv sync --project audio

# Live preview at http://127.0.0.1:5174 (space play/pause, arrows seek, [ ] scenes, , . frame step).
dev:
    bun run dev

# Build the page into dist/ (the exporter serves it from there).
build:
    bun run build

# Download the styles' pinned fonts (to .cache/fonts) and write the film's subsets + manifest per style
# (films/infotheory/fonts/<style>/): every style the film imports, or one with `just fonts --style nebula`.
fonts *args:
    bun scripts/fonts.ts {{args}}

# Type-check the engine, styles, films and scripts.
check:
    bunx tsc --noEmit

# Enforce the dependency direction films -> styles -> engine.
check-imports:
    bun scripts/check-imports.ts

# Schema, timeline, rendering and text-layout checks of the built film in every one of its styles (text outside the frame
# or the 5% safe area is an error); `just validate --style <id>` checks one.
validate *args: build
    bun scripts/validate.ts {{args}}

# Pixel regression of every style against films/<film>/regress/<style>.json (SwiftShader + CPU 2D canvas); --style <id> for one.
regress *args: build
    bun scripts/regress.ts {{args}}

# Write the resolved timeline only (just cues writes it too).
timeline: build
    bun scripts/export.ts --timeline films/infotheory/timeline.json

# Failure-mode tests of the exporter (missing/short audio, launch and encoder failure, interrupt, deadline, concurrency).
test-export: build
    bun scripts/test-export.ts

# Print the scene list with times.
scenes: build
    bun scripts/export.ts --scenes

# Write single frames for checking, e.g. `just shots 5,20.5,60` or `just shots 5,60 --style nebula`.
shots times="0,10" *args: build
    bun scripts/export.ts --shots {{times}} {{args}}

# Dump the film's sound-effect cue sheet and resolved timeline to films/infotheory/ (the score reads both).
cues: build
    bun scripts/export.ts --cues films/infotheory/cues.json --timeline films/infotheory/timeline.json

# Synthesize the score + effects -> audio/music.wav, audio/music.mp3 (reads films/infotheory/cues.json and timeline.json).
music: cues
    uv run --project audio python films/infotheory/score.py

# Full 1080p30 export with 4 headless Chrome workers -> out/infotheory.mp4 (`just export 4 18 --style nebula` -> out/infotheory-nebula.mp4)
export workers="4" crf="18" *args: build
    bun scripts/export.ts --workers {{workers}} --crf {{crf}} {{args}}

# Everything: cues -> music -> video.
all: cues music export
