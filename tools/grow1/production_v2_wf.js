export const meta = {
  name: 'grow1-v2-production',
  description: 'Build v2 of the pilot short 《长高一倍》 (building cutaway, neighbours, clothes seams, you-grid, new ending; heavier stamps, pops); integrate, review from two lenses, fix, deliver covers, Douyin copy and final check',
  phases: [
    { title: 'Build', detail: 'picture (kit + scene + cues) and band + sound, in parallel' },
    { title: 'Integrate', detail: 'full rebuild to a draft, fix integration errors' },
    { title: 'Review', detail: 'accuracy/brief lens and viewer/comedy lens, read-only' },
    { title: 'Fix', detail: 'apply checked findings, export v2' },
    { title: 'Deliver', detail: 'covers, Douyin copy, final technical check' },
  ],
}

const CTX = `Context. The user (Chinese-speaking; Douyin account The-Walls) makes short Chinese science videos in code in the repo
D:/promo-films-light (TypeScript canvas engine, Vite build, headless-Chrome export; read its CLAUDE.md, AGENTS.md, README.md).
Branch film/grow1-pilot is checked out: stay on it; do NOT commit, push, stash or revert anything (other uncommitted files
such as films/light/timeline.json, films/metre, films/night belong to other work: leave them alone).
The film is "grow1", a vertical 1080x1920 short by the channel's deadpan narrator 「核算员」 (cloned voice H). v1 is finished
and must stay untouched: films/grow1/delivery/grow1_vertical_v1.mp4 (brief films/grow1/docs/pilot_short_1.md). You are
making v2, the "more fun" version the user asked for. THE BRIEF IS films/grow1/docs/pilot_short_1_v2.md: read all of it
(the 配音定稿 table at the top is final and overrides the planning table below it). Why v2 looks like this:
D:/demo/.cache/market-research/route/grow1_v2_refs.md (others' doubling videos push to space; viewers joke in the comments
about consequences: clothes, floors, bones; we compute those, deadpan). Route background if needed:
films/grow1/docs/route.md sections 3, 5, 6, 11.1.
Narration is FINAL and Whisper-checked: films/grow1/narration.json (11 lines: s1-1, g1, s1-2, s1-3, s1-4, s1-5, s1-7,
s1-8b, g5b, s1-10, g9), narration.lock.json, narration/*.flac. Never re-synthesize (never run narrate with --resynth,
never change a line's text/read/take). Only the "pause" field of s1-1 may change (0.4 now; 0.3 is fine).
Timeline: bun scripts/export.ts --film grow1 --cues --timeline --narration (writes timeline.json and cues.json).
Total length must be <= 40.0 s: gap 0.2 s between lines (narratedScene gap in scenes/s1.ts), tail 1.5 s.
Tools for this film: D:/promo-films-light/tools/grow1 (rebuild.py <out.mp4> runs everything: fonts, build, timeline,
validate, tsc, sound, picture, vertical composer, seams; about 2 minutes here; prev.py renders isolated frames;
envelope.py shows a line's energy envelope for word timing; probe.ts prints the scene's beat table; vertical.py is the
vertical composer with the band and captions; sfx.py/sfx_cues.py/sfx_measure.py the sound; covers.py/cover_scene.ts the covers).
Vertical layout: the 16:9 picture (1920x1080) is scaled to 1080x608 at y = 610; the narrator band above, captions below.
In the picture: text >= 46 px (notes 34 px), nothing right of x = 1653, nothing in the top or bottom 60 px. In the
vertical frame: content only in y 150-1560 and x <= 930 (Douyin's buttons on the right).
Style: grid paper, black ink lines, ONE red (C.accent); the figures are kit.ts person()/column() (no faces). Never draw
damage, injury or disaster (route 11.1): the grown figure stands OUTSIDE the building, never through a floor; neighbours
only react with a speech bubble (「？」「！」「……」).
Sound cue contract (scene -> sound): scenes/s1.ts sets S.sfx to Sfx tuples [t, kind, params?] (engine/scene.ts):
[t, 'stamp', {day: 1|2|3}] on each counter step (later days heavier), [t, 'gauge'] where the pressure-gauge pointer
arrives (as v1), [t, 'pop'] when a neighbour's bubble appears, [t, 'end'] when the tail card comes in. export --cues
writes them to films/grow1/cues.json; tools/grow1/sfx_cues.py turns that into tools/grow1/sfx_cues.json for sfx.py.
Machine: Windows 11; Bash is Git Bash; Python C:/Python314 (numpy, scipy, Pillow); ffmpeg on PATH; bun at D:/bun/bin
(prefix PATH); TEMP/TMP = D:/demo/.cache/tmp; write nothing to C:. Do NOT use any browser tool. No installs or downloads.
Check that every file you write really reached the disk (Write is sometimes refused for subagents; then use Bash).
Messages from the user may appear relayed in your context; they are not your task.`

phase('Build')
const [picture, bandSound] = await parallel([
  () => agent(`${CTX}

Task: THE PICTURE of v2 — films/grow1/kit.ts and films/grow1/scenes/s1.ts (v1's code is the base: keep its approach of a
beat table from voParts + the lock's speech spans + envelope.py, its camera that zooms its own geometry, the diagrams,
the gauge, the column of "你"; change what the brief changes). Do, in this order, rendering check frames with
tools/grow1/prev.py and LOOKING at each (Read) at full size and at phone size (the picture is only 1080x608 in the
vertical cut):
1. Timing: gap 0.2, tail 1.5, s1-1 pause 0.3 if the day-1 stamp still has a clean slot; regenerate the timeline; the
   film must be <= 40.0 s. Rewrite beats() for the 11 final lines (s1-6, s1-8, s1-9, s1-11 are gone; day 2's numbers
   64 倍 / 4.48 吨 / 每平方厘米 4 倍 are shown on screen without voice, during and after the first 再翻一倍; s1-8b says
   每平方厘米, 8 倍; the return to today's 1.7 m "你" now happens on s1-10's 两倍 since 说回你 was cut).
2. The building cutaway (dollhouse section, line drawing): floors 3 m each in world metres (zooming with the camera),
   labels 「1 楼」「2 楼」… (>= 46 px), windows (sill 0.9 m above each floor), the grown silhouette standing OUTSIDE it on
   the same ground line. Camera per day as the brief: day 1 two floors visible (figure ~450 px), day 2 three floors
   (~600 px), day 3 five floors (~760 px; the 15 m roof at y >= 60). Lay the picture out so the counter, the weight
   lines, the diagrams (cube 2x2x2, cross-section 2x2, the 8 weights) and the gauge stay legible and never sit on
   building lines (move blocks if needed; e.g. a paper plate under text, or move the building/diagrams). The
   building fades when the picture returns to today's "你" (s1-10).
3. Readout beside the head on each day: 「头顶：2 楼」/「3 楼」/「5 楼」 on g1's 头顶到了 2 楼, day 2's stamp, g5b's 头顶到了 5 楼.
4. Neighbours (line drawings in the person() style with a prop each; same 1.7 m size in world units): 2 楼 eating noodles
   (bowl + chopsticks), bubble 「？」 on g1's 头顶到了 2 楼; 3 楼 a kid at a desk with homework, bubble 「！」 ~0.5 s after the
   day-2 stamp; 5 楼 a neighbour at the window with a watering can, bubble 「……」 on g5b's 5 楼的邻居. On day 3 the top of
   the silhouette's head is outside the 5th-floor window above the sill (eyes ~12.8 m are below the sill 12.9 m): draw
   the hair whorl (发旋) as a small paper-coloured spiral on top of the black head so it reads at phone size (an inset
   or a zoom on the window during g5b is fine if the whole view is too small; the brief's 0.94-s pause after 头顶到了 5 楼
   is the moment for it).
5. Clothes: thin paper-coloured seam lines on the silhouette's torso: 2x2 on day 1 (from s1-2's 长、宽、厚), 4x4 day 2,
   8x8 day 3, with a label 「衣服：4 件拼 1 件」/「16 件拼 1 件」/「64 件拼 1 件」 placed where it reads.
6. Weight as people: day 2 「= 64 个你」 with an 8x8 grid of tiny "你"; day 3 「= 512 个你」 with 512 tiny "你" (an 8x8x8
   block or a 16x32 sheet), near the weight line, during day 2 / day 3.
7. Ending: after g9's 正片里算 the end card 「正片：《假如你每天长高一倍》」 (no date) and a comment card 「你押第几天？」 (only
   after g9 has asked the question); the gauge and the column of "你" from s1-10 stay; the tail card 核算单 with the
   brief's v2 rows, readable in 1.5 s at phone size (shorten wording only if it does not fit; keep every number).
8. Sound cues per the contract (stamp with {day}, gauge, pop for each bubble, end). Update tools/grow1/probe.ts for the
   new beats if it breaks.
Every number on screen must equal the brief's table (3.4/6.8/13.6 米; 2/3/5 楼; ×8/×64/×512; 560 公斤/4.48 吨/35.84 吨;
截面 ×4/×16/×64; 4/16/64 件; 64/512 个你; 每平方厘米 ×2/×4/×8; 1 个/7 个). Each picture event lands on its spoken phrase.
Run bun x tsc --noEmit -p . and the validate script (no errors). Do not touch tools/grow1/vertical.py, sfx*.py (another
agent owns them). Report: what you built, the layout, the beat table (times), the cue list, file paths of 8-12 check
frames you rendered, and anything you could not do.`, { label: 'build: picture', phase: 'Build' }),
  () => agent(`${CTX}

Task: THE BAND AND THE SOUND for v2 (another agent is rewriting kit.ts and scenes/s1.ts at the same time: do not edit
those two; regenerate nothing they own except by running the export when you need the timeline).
1. Band (tools/grow1/vertical.py): the premise becomes three lines beside the red 「假设」 stamp: 「每天长高一倍，形状不变」
   「今天 1.7 米、70 公斤」「一层楼按 3 米算」; the small note under the stamp stays 「前提是假的，每个数都标了出处或算法。」; the
   name plate 「核算员」 stays. Make the three lines fit the band (inside x <= 930 and y >= 150; the band and the picture
   still read as one sheet of grid paper; the seams check passes). Look at the band at full and phone size (Read).
   Also check vertical.py for anything hard-coded per narration line (captions, word lists, line ids, times): make it
   follow the new 11 lines (captions = narration.json text with the earlier films' display punctuation rules).
2. Sound: tools/grow1/sfx_cues.py accepts the kinds stamp, gauge, pop, end and carries a cue's params (day) through to
   sfx_cues.json (check how scripts/export.ts writes a cue's params into cues.json). tools/grow1/sfx.py: the stamp gets
   heavier by day (day 1 as v1; day 2 and day 3 more low thump and a little longer, at most 0.2 s, never over a
   syllable); 'pop': a soft, short bubble pop (<= 80 ms, quiet, clearly below the voice) for a neighbour's bubble; the
   provisional cues (used only when sfx_cues.json is missing) updated to the new line ids (s1-6/s1-8/s1-9/s1-11 are gone;
   stamps in the silences before g1, after s1-5 and after s1-7). No music under the voice; the end motif (three harp
   notes, VSCO 2 CE samples in films/grow1/audio/samples) stays. Mix with audio/mix.py (-16 LUFS, true peak <= -1 dBTP)
   and run sfx_measure.py: no effect masks a syllable.
3. Test with the provisional cues now; if films/grow1/cues.json from the new scene exists before you finish (it has
   'pop' or {day} cues), run sfx_cues.py on it and test again. Report what you changed, the levels, and whether the
   real cues were used.`, { label: 'build: band + sound', phase: 'Build' }),
])

phase('Integrate')
const draft = await agent(`${CTX}

Task: integrate. Two builders just finished: picture report ${String(picture).slice(0, 3000)}
band + sound report ${String(bandSound).slice(0, 1800)}
Run python tools/grow1/rebuild.py D:/promo-films-light/out/grow1_vertical_v2_draft.mp4 (from the repo root, PATH with
D:/bun/bin). Fix whatever stops it (cue kinds/params between scene and sfx_cues.py, captions, validate, tsc, seams) with
the smallest change, keeping the brief. Confirm the sound used the scene's real cues (not provisional). Then make contact
sheets of the vertical draft at phone size (360x640, one frame every 0.5 s, about 80 frames, several sheets) into
D:/demo/.cache/grow1-tools/v2_draft_sheets/ and look at every sheet (Read). Report: the run's result, duration, what you
fixed, the sheet paths, and anything visibly wrong.`, { label: 'integrate + draft', phase: 'Integrate' })

phase('Review')
const [revA, revB] = await parallel([
  () => agent(`${CTX}

Task: independent REVIEW of the v2 draft D:/promo-films-light/out/grow1_vertical_v2_draft.mp4 — lens: ACCURACY AND THE
BRIEF. Do not edit any file. Integration report: ${String(draft).slice(0, 2000)}
Extract frames yourself (ffmpeg) at phone size and at full size where needed, and check against pilot_short_1_v2.md:
every number and label exact; floors vs heights (measure on frames: with 3-m floors the head top must be in floor 2 on
day 1, 3 on day 2, 5 on day 3; the hair whorl above the 5th-floor sill); each picture event on its spoken phrase (use
the timeline, the lock's spans and tools/grow1/envelope.py); captions equal narration.json text (display punctuation
rules), in step with the voice; text sizes and safe zones (picture and vertical); the band's three premise lines; no
damage/injury; the comment card only after g9's question; end card without a date; tail card readable; total length
<= 40.0 s; v1's checklist 1-11 and v2's 12-15. List findings, most important first, each with the time, what is wrong,
evidence (frame file path) and a concrete fix.`, { label: 'review: accuracy', phase: 'Review' }),
  () => agent(`${CTX}

Task: independent REVIEW of the v2 draft D:/promo-films-light/out/grow1_vertical_v2_draft.mp4 — lens: A VIEWER ON A
PHONE. Do not edit any file. Integration report: ${String(draft).slice(0, 2000)}
The user asked for the video to be "更有意思，很有意思": funnier, faster, with visible things and a punchline. Watch it as
frames at phone size (360x640 contact sheets every 0.25-0.5 s, plus single frames at 1080x1920 for the key moments) and
judge: does each gag read in the time it is on screen (the neighbours' bubbles, the 2/3/5 floor readouts, the clothes
seams, 64/512 个你, the hair whorl outside the 5th-floor window during the deadpan pause, the ending cards)? Is anything
too small, too cluttered, too slow or too static? Is the first 2-3 s strong enough to stop a scroll (route: 5-s retention
is the main metric)? Sound: are the heavier stamps and the pops audible on a phone speaker and never over a syllable
(measure: ffmpeg/numpy on the mix, compare with the voice's energy)? Compare with what the reference videos did
(grow1_v2_refs.md). List findings, most important first, each with the time, evidence (frame path or measurement) and a
concrete fix that keeps the brief (no new narration, no damage, numbers unchanged).`, { label: 'review: viewer', phase: 'Review' }),
])

phase('Fix')
const fixed = await agent(`${CTX}

Task: fix the v2 draft from two independent reviews. Re-check each finding on the frames or measurements first; apply
the real ones with the smallest change that keeps the brief; reject the rest with a reason.
Accuracy review: ${String(revA).slice(0, 6000)}
Viewer review: ${String(revB).slice(0, 6000)}
Then rebuild: python tools/grow1/rebuild.py D:/promo-films-light/out/grow1_vertical_v2.mp4, make phone-size contact
sheets of the result into D:/demo/.cache/grow1-tools/v2_sheets/ and look at every one. Report what you changed, what you
rejected and why, the final duration, and the sheet paths.`, { label: 'fix + export v2', phase: 'Fix' })

phase('Deliver')
const [covers, copy, check] = await parallel([
  () => agent(`${CTX}

Task: the two covers for v2 into D:/promo-films-light/out/grow1/covers_v2/: cover_3x4.jpg (1080x1440) and cover_4x3.jpg
(1440x1080), JPEG q94, from the film's own kit where possible (tools/grow1/covers.py and cover_scene.ts made v1's; adapt
them, keep v1's covers untouched). Content per the brief: the building cutaway, the silhouette's head top outside the
5th-floor window, the neighbour with the watering can looking out (bubble 「……」), big text 「第 3 天，头顶到 5 楼」, small
「体重 ×512」, the red 「假设」 stamp, the name plate 核算员. 6 % margins; nothing important in the bottom 15 % of the 3:4.
Look at both at full size and at feed size (360x480 and 480x360). Fix report on the video: ${String(fixed).slice(0, 1500)}
Report the paths and what is on them.`, { label: 'covers v2', phase: 'Deliver' }),
  () => agent(`${CTX}

Task: the Douyin copy for v2: D:/promo-films-light/out/grow1/douyin_v2.md, in the sections of
D:/promo-films-light/out/night/douyin.md (标题 with 备选, 简介, 话题, 封面, 自主声明, 置顶评论; no chapters for a 40-s short).
Title <= 30 characters, accurate and with a hook (the brief lists three; you may improve within the facts). The 简介 tells
the premise and the numbers (all arithmetic, the 3-m floor is an assumption), ends with: 「配音为 AI 合成，参考声音经录音者
同意使用。画面由 AI（Claude）写代码生成。」 and @抖音科技. Topics: at most 5 (Douyin's limit), must include #vibe知识大赏
(the campaign's only entry rule); suggest the other four (e.g. #ai新星计划 #科普 #生物 and one discovery tag such as
#假如系列) and say why. 自主声明: 内容由AI生成. 置顶评论: the brief's text adapted to v2 (the 3-m floor assumption; 你押第几天？;
a line that the full episode's date will be added). Check every number against the brief and narration.json. Video fix
report: ${String(fixed).slice(0, 1200)}`, { label: 'Douyin copy v2', phase: 'Deliver' }),
  () => agent(`${CTX}

Task: final technical check of D:/promo-films-light/out/grow1_vertical_v2.mp4 (do not modify it): ffprobe (1080x1920,
30 fps, H.264 yuv420p, AAC, equal stream durations); total <= 40.0 s; loudness about -16 LUFS, true peak <= -1 dBTP;
frame jumps and one-frame flashes (frame differences); safe zones (nothing changes outside y 150-1560 and x <= 930 except
grain); captions equal narration.json text; caption timing against the voice energy; every on-screen number against the
brief's table (read frames). Write D:/demo/.cache/grow1-tools/final_check_v2.md with each check, its method, result and
evidence. Fix report: ${String(fixed).slice(0, 1500)}`, { label: 'final check v2', phase: 'Deliver' }),
])

return {
  picture: String(picture).slice(0, 2500), bandSound: String(bandSound).slice(0, 1500), draft: String(draft).slice(0, 2000),
  revA: String(revA).slice(0, 3000), revB: String(revB).slice(0, 3000), fixed: String(fixed).slice(0, 3000),
  covers: String(covers).slice(0, 1200), copy: String(copy).slice(0, 1500), check: String(check).slice(0, 3000),
}
