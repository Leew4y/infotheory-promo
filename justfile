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

# Download the style's pinned fonts (to .cache/fonts) and write the film's subsets + manifest (films/infotheory/fonts).
fonts:
    bun scripts/fonts.ts

# Type-check the engine, styles, films and scripts.
check:
    bunx tsc --noEmit

# Enforce the dependency direction films -> styles -> engine.
check-imports:
    bun scripts/check-imports.ts

# Schema, timeline, rendering and text-layout checks of the built film (text outside the frame or the 5% safe area is an error).
validate *args: build
    bun scripts/validate.ts {{args}}

# Pixel regression against films/<film>/regress-baseline.json (SwiftShader + CPU 2D canvas).
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

# Write single frames for checking, e.g. `just shots 5,20.5,60`.
shots times="0,10": build
    bun scripts/export.ts --shots {{times}}

# Dump the film's sound-effect cue sheet and resolved timeline to films/infotheory/ (the score reads both).
cues: build
    bun scripts/export.ts --cues films/infotheory/cues.json --timeline films/infotheory/timeline.json

# Synthesize the score + effects -> audio/music.wav, audio/music.mp3 (reads films/infotheory/cues.json and timeline.json).
music: cues
    uv run --project audio python films/infotheory/score.py

# Full 1080p30 export with 4 headless Chrome workers -> out/infotheory.mp4
export workers="4" crf="18": build
    bun scripts/export.ts --workers {{workers}} --crf {{crf}}

# Everything: cues -> music -> video.
all: cues music export
