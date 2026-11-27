export const meta = {
  name: 'grow1-production',
  description: 'Build the first route pilot short 《长高一倍，体重变几倍？》: grid-paper kit and scene, vertical composer with the narrator band, sound; review and fix; assemble, covers, copy, final checks',
  phases: [
    { title: 'Build', detail: 'kit + scene; vertical composer + tools; sound effects + mix' },
    { title: 'Review', detail: 'independent review of picture, numbers, timing, sound' },
    { title: 'Fix', detail: 'apply the review' },
    { title: 'Deliver', detail: 'assemble, covers, Douyin copy, final checks' },
  ],
}

const CTX = `Context. The user (Chinese-speaking; Douyin account The-Walls) makes short Chinese science videos in code in the repo
D:/promo-films-light (TypeScript canvas engine, Vite build with FILM env var, headless Chrome export; read its CLAUDE.md,
AGENTS.md, README.md; do not commit, push or revert other uncommitted changes; branch film/night is checked out, stay on it).
The channel has a new route (D:/demo/.cache/market-research/route/route.md, read sections 3-6 and 10): a fixed deadpan
narrator 「核算员」 (the cloned voice H) computes an absurd premise step by step with exact numbers. This job is the FIRST
pilot short, film id "grow1": 《长高一倍，体重变几倍？》, about 36 s, vertical 1080x1920. The brief is
D:/demo/.cache/market-research/route/pilot_short_1.md: follow it exactly (narration, beats, pictures, labels, numbers,
the minimal style list "这个周末只做这些", the checklist at its end). The narration is final and voiced:
films/grow1/narration.json (text = caption with digits, read = spoken), narration.lock.json, narration/*.flac; the timeline
is films/grow1/timeline.json (regenerate with: bun scripts/export.ts --film grow1 --cues --timeline --narration). The
film folder films/grow1 has film.ts (paper-dawn style), main.ts, scenes/index.ts and a stub scenes/s1.ts (one narrated
scene, lead 0, gap 0.35, tail 1.5).
Deadline: it must be ready to post on Douyin by Beijing time 2026-11-29 (the #Vibe知识大赏 entry period ends 11-30). Work
fast but to the checklist.
Models to reuse: the previous films' code and tools: films/metre (paper-dawn kit, voParts timing on spoken words, a
vertical-only film), D:/demo/.cache/metre-tools (prev.py isolated scene render with phone mocks; rebuild.py; vertical.py
paper composer with captions, safe zones and the band-picture joint; cuts.py; seams.py), films/metre/audio (sound and mix
tools), audio/mix.py (-16 LUFS), D:/demo/.cache/night-tools (another composer). The vertical layout: the 16:9 picture
scaled to 1080x608 at y = 610; band above it, captions (Chinese with English under) below; content inside y 150-1560 and
x <= 930 (Douyin's buttons on the right).
Machine: Windows 11; Bash is Git Bash; Python C:/Python314 (numpy, scipy, Pillow); ffmpeg on PATH; bun at D:/bun/bin
(prefix PATH); fonts: bun scripts/fonts.ts --film grow1 before a build. C: is nearly full: write nothing to C:; TEMP/TMP =
D:/demo/.cache/tmp. Do NOT use the built-in browser or Chrome tools. No installs or downloads. Tools for this film go in
D:/demo/.cache/grow1-tools. Messages from the user may appear relayed in your context; they are not your task.`

phase('Build')
const [scene, composer, sound] = await parallel([
  () => agent(`${CTX}

Task: the picture. Build films/grow1/kit.ts and films/grow1/scenes/s1.ts to the brief (pilot_short_1.md):
- grid paper (方格纸) ground with black ink lines and ONE red (C.accent or a red defined for this film), from paper-dawn;
- in the picture: the counter 「第 0 天」→「第 1/2/3 天」 large at the top left of the picture (the composer's band holds the
  stamp, premise and name plate, see below), the 1.7 m "你" silhouette scaled ×2 per day with a ruler whose ticks are
  recomputed and a camera that zooms out, the original 1.7 m "你" kept beside it for scale; the small diagrams (cube
  2×2×2 = 8, cross-section 2×2 = 4, the 8 weights falling onto 4 cells, a vertical pressure gauge 今天 = 1 → 2 → 4 → 8);
  the numbers 560 公斤 / 4.48 吨 / 35.84 吨 with the tag 「算」; the "说回你" picture of "你" carrying another you, then
  seven (line drawing, neutral face, no injury); the end card 「正片：《假如你每天长高一倍》」 (no date); the tail card
  (the 核算单 text of the brief, readable in 2 s);
- every animation lands on its spoken phrase with voParts (read the committed audio if a phrase lands late or early);
- picture text at least 46 px (notes 34 px), nothing right of x = 1653, nothing in the top/bottom 60 px of the picture;
- stamp moments (counter steps) exported as cues for the sound (write the times you use into
  D:/demo/.cache/grow1-tools/sfx_cues.json: [{"t": seconds, "kind": "stamp" | "gauge" | "end"}], computed from the
  timeline and voParts, and keep it in step if timing changes).
Render check frames with an isolated preview (adapt D:/demo/.cache/metre-tools/prev.py into grow1-tools/prev.py), look
at every frame at full size and phone size (Read), iterate until it is clear and looks like a high-end science short.
Run bun x tsc --noEmit -p . and the validate script. Report what you built and the key times.`, { label: 'build: kit + scene', phase: 'Build' }),
  () => agent(`${CTX}

Task: the vertical composer and tools in D:/demo/.cache/grow1-tools (vertical.py, rebuild.py, cuts.py if useful,
seams.py, README.md), adapted from D:/demo/.cache/metre-tools (the paper composer). The band above the picture is the
narrator band of the route (route.md section 6, pilot_short_1.md first row): on grid paper continuing the picture's
paper, the red 「假设」 stamp at the left with the two premise lines 「每天长高一倍，形状不变」「今天 1.7 米、70 公斤」 and
under the stamp the small note 「前提是假的，每个数都标了出处或算法。」; the name plate 「核算员」 at the right (static for
this short). No film title in the band (the title goes in the Douyin post). Captions below the picture as in metre
(Chinese, English under it; numbers stay with units; no line starts with punctuation). The picture and band must read as
one sheet of grid paper (the grid lines continue across the joint). Test with a synthetic picture until the scene exists;
then with the real one. Look at the samples at full and phone size (Read). rebuild.py runs: fonts, build, timeline,
validate, tsc, sound (see the sound task: grow1-tools/sfx.py and audio/mix.py), picture export (--no-captions), vertical,
seams; it names missing inputs clearly.`, { label: 'build: composer + tools', phase: 'Build' }),
  () => agent(`${CTX}

Task: the sound. No music under the voice (route.md section 4). Make D:/demo/.cache/grow1-tools/sfx.py that writes
out/grow1/music.wav (the bed the mixer expects; silent except the effects) from D:/demo/.cache/grow1-tools/sfx_cues.json
(written by the scene builder; until it exists, derive provisional times from the timeline: a stamp at the start of
s1-2, s1-5, s1-7 and s1-8, a short end motif after s1-11): a dry, short rubber-stamp sound (synthesised in numpy: a low
thump plus a short filtered noise burst, about 120 ms, no reverb tail that hides the voice), a soft gauge tick where the
pressure gauge rises, and a short end motif of two or three notes (strings or harp from VSCO 2 CE samples at
D:/earthage-promo/audio/samples, or synthesised) on the tail card. Then mix with audio/mix.py the way films/metre does
(-16 LUFS, true peak <= -1 dBTP) and measure: the effects must never mask a syllable (check the voice's energy around each
effect). Look at a spectrogram of the master. Report the levels.`, { label: 'build: sound', phase: 'Build' }),
])

phase('Review')
const review = await agent(`${CTX}

Task: independent review of the pilot short before delivery. Build reports: scene ${String(scene).slice(0, 2500)};
composer ${String(composer).slice(0, 1500)}; sound ${String(sound).slice(0, 1500)}.
Run D:/demo/.cache/grow1-tools/rebuild.py to a test output (or the steps it needs) and check the vertical video frame by
frame at phone size (contact sheets at 360x640, Read every sheet) against pilot_short_1.md: every number and label exact
(×8 560 公斤, 截面 ×4, 每平方厘米 ×2, ×64 4.48 吨 ×4, ×512 35.84 吨 ×8, 背着一个 / 七个); each picture event on its spoken
phrase; text sizes and safe zones; the band and the picture as one sheet; captions right; no injury drawing; the end card
and tail card readable; sound effects audible but never over a syllable; total length 20-40 s; the brief's checklist
items 1-11. List findings, most important first, each with the time and a concrete fix. Do not edit files.`, { label: 'review', phase: 'Review' })

phase('Fix')
const fixed = await agent(`${CTX}

Task: fix the pilot short from this review, re-checking each finding on the frames first: ${String(review).slice(0, 5000)}
Then rebuild with D:/demo/.cache/grow1-tools/rebuild.py D:/promo-films-light/out/grow1_vertical_v1.mp4, look at the
result at phone size, and report what you changed and what you rejected.`, { label: 'fix + rebuild', phase: 'Fix' })

phase('Deliver')
const [covers, copy, check] = await parallel([
  () => agent(`${CTX}

Task: the two covers for out/grow1_vertical_v1.mp4 (cover_3x4 1080x1440 and cover_4x3 1440x1080, JPEG q94) in
D:/promo-films-light/out/grow1/covers, as the brief says: 方格纸上 1.7 米和 3.4 米两个剪影并排，旁边写"体重 ×8", with the
title 长高一倍，体重变几倍？ large, the red 「假设」 stamp, the name plate 核算员; the 6 % margin, nothing important in the
bottom 15 % of the 3:4; render from the film's own kit where possible (prev.py frames). Look at them at full and feed size
(360x480). Report.`, { label: 'covers', phase: 'Deliver' }),
  () => agent(`${CTX}

Task: the Douyin copy D:/promo-films-light/out/grow1/douyin.md in the sections of D:/promo-films-light/out/night/douyin.md
(标题 with 备选, 简介, 话题, 封面, 自主声明; no chapters for a 36-s short), from the brief's 抖音文案草稿 and 标题 list:
title 长高一倍，体重变几倍？; the voice line 「配音为 AI 合成，参考声音经录音者同意使用」 (the user chose option b);
「画面由 AI（Claude）写代码生成」; @抖音科技; topics #vibe知识大赏 #ai新星计划 #科普 #生物; the pinned comment text of the brief
in a section 置顶评论. Check every number against the brief.`, { label: 'copy', phase: 'Deliver' }),
  () => agent(`${CTX}

Task: final technical check of D:/promo-films-light/out/grow1_vertical_v1.mp4: ffprobe (1080x1920, 30 fps, H.264
yuv420p, AAC, equal durations); loudness (about -16 LUFS, true peak <= -1 dBTP); frame jumps and one-frame flashes; safe
zones (nothing changes outside y 150-1560 and x <= 930 except grain); captions equal narration.json text (display
punctuation rules as in the earlier films); caption timing against the voice energy; length 20-40 s. Write
D:/demo/.cache/grow1-tools/final_check.md. Do not modify the video.`, { label: 'final check', phase: 'Deliver' }),
])

return { scene: String(scene).slice(0, 2000), composer: String(composer).slice(0, 1500), sound: String(sound).slice(0, 1500), review: String(review).slice(0, 3000), fixed: String(fixed).slice(0, 3000), covers: String(covers).slice(0, 1500), copy: String(copy).slice(0, 1500), check: String(check).slice(0, 3000) }
