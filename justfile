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

# Print the scene list with times.
scenes: build
    bun scripts/export.ts --scenes

# Write single frames for checking, e.g. `just shots 5,20.5,60`.
shots times="0,10": build
    bun scripts/export.ts --shots {{times}}

# Dump the page's sound-effect cue sheet to audio/cues.json.
cues: build
    bun scripts/export.ts --cues audio/cues.json

# Synthesize the score + effects -> audio/music.wav, audio/music.mp3 (reads audio/cues.json).
music:
    uv run --project audio python audio/music.py

# Full 1080p30 export with 4 headless Chrome workers -> out/infotheory.mp4
export workers="4" crf="18": build
    bun scripts/export.ts --workers {{workers}} --crf {{crf}}

# Everything: cues -> music -> video.
all: cues music export
