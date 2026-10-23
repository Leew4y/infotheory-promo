# 0d · macOS 实机验证

阶段 0 的另外三项（0a 确定性、0b 录屏素材嵌入、0c Playwright 录屏）已在 Windows 上完成，结果见 `spikes/RESULTS.md`。
0d 在 macOS 上重跑同一批实验，确认引擎和工具链在另一个平台上能用，并记录差异。计划见 `docs/plan/reusable-engine.md` 的"0d"一节。
2026-10-23 已在 Apple M5 Pro 上跑完，结果在本目录的 `RESULTS.md`；本文件说明怎样重跑。

## 前置条件

- 一个包含按平台基线（`films/<film>/regress/<style>.<os-arch>.json`）和固定浏览器（`just browser`）的提交。
- bun、uv、just、ffmpeg（在 PATH 上）。
- 浏览器：`just browser` 下载固定版本的 Chrome for Testing（版本与 sha256 见 `scripts/lib/browser-pin.ts`）到 `.cache/chrome/`，
  `scripts/` 下的工具自动使用它。spike 脚本有自己的查找顺序，不认识这个目录，运行前先设
  `export CHROME_PATH="$(bun scripts/browser.ts --path)"`（下面第 0 步做了），否则它们会用 `/Applications` 里的 Google Chrome。
- 约 2 GB 空闲磁盘（诊断素材写到 `out/`，已被 git 忽略）。
- 跑性能和时延测试时尽量关掉其他重负载程序，插电运行，并在每个计时结果旁记下 `uptime` 的负载。

## 步骤

在仓库根目录依次运行。每一步都会把结果写进 `spikes/0d-macos/`。某一步失败时，记下完整报错，继续后面的步骤。

```bash
# 0. 依赖、固定浏览器、环境信息
bun install
just browser
export CHROME_PATH="$(bun scripts/browser.ts --path)"
{ sw_vers; sysctl -n machdep.cpu.brand_string; sysctl -n hw.memsize; system_profiler SPDisplaysDataType | grep -E "Chipset|Metal"; \
  "$CHROME_PATH" --version; ffmpeg -version | head -1; bun --version; } > spikes/0d-macos/env.txt 2>&1

# 1. 构建
just build infotheory

# 2. GPU 能力检查 + 三张样张（spikes/0d-macos/frames/*.png）
bun spikes/0d-macos/gpu-check.ts

# 3. 0a 确定性：现状参数，与 CPU 2D canvas 参数各一次
bun spikes/0a-determinism/run.ts --out spikes/0d-macos/0a-default.json
EXTRA_ARGS="--disable-accelerated-2d-canvas" bun spikes/0a-determinism/run.ts --out spikes/0d-macos/0a-cpu2d.json

# 4. 0b 录屏素材嵌入：生成素材（约 1–3 分钟），正确性检查，性能
bun spikes/0b-media/make-source.ts out/0b-media
RESULT_DIR=spikes/0d-macos bun spikes/0b-media/run.ts check --fmt jpg
RESULT_DIR=spikes/0d-macos bun spikes/0b-media/run.ts export --page film --from 24 --to 42 --workers 4
RESULT_DIR=spikes/0d-macos bun spikes/0b-media/run.ts export --page diag --fmt jpg --workers 4

# 5. 0c Playwright 录屏（结果含时延分解：事件 → 处理函数 → 绘制该变化的帧开始 → 该帧的 screencast 时间戳）
(cd spikes/0c-capture && bun install && RESULT_DIR=spikes/0d-macos bun run.ts)
cp out/0c-capture/sample-*.jpg spikes/0d-macos/
```

## 6. 阶段 1 及之后的检查

接着上面的步骤，在同一分支上运行：

```bash
uv sync --project audio
just music infotheory                       # 生成 out/infotheory/music.wav（导出与失败用例都需要它）
just validate infotheory                    # 两套风格都 0 error 即通过
just regress infotheory                     # 与 darwin-arm64 基线逐像素比较，两套风格都须 PASS
just regress math-lessons
just test-export infotheory                 # 全部 ok 即通过（macOS 上多一个真实 SIGINT 用例）
just test-capture                           # 全部 ok 即通过；多跑几次看是否稳定
bun scripts/export.ts --film infotheory --from 30 --to 36 --out out/mac-1c.mp4
bun scripts/export.ts --film infotheory --from 30 --to 36 --style nebula --out out/mac-1c-nebula.mp4
just new-film macdemo nebula && just fonts macdemo && just validate macdemo && just export macdemo 4 18 --noaudio
just dev infotheory                         # 打开 http://127.0.0.1:5174：字体加载完才能播放；加 ?style=nebula 看第二套风格
```

把输出贴回即可（`films/macdemo/` 不用提交）。

## 怎样比较画面

- 同一平台：`just regress <film>` 在 SwiftShader + CPU 2D canvas 下逐帧比较原始 RGBA 的哈希，基线按平台分开
  （`<style>.darwin-arm64.json`、`<style>.win32-x64.json`）。基线记录了录制时的浏览器版本，与当前版本不同时 regress 会给出警告。
  darwin-arm64 的基线是用 Chrome 155.0.8059.85 录的，固定版本（同一版本的 Chrome for Testing）下逐像素一致（2026-10-23 核对）；
  win32-x64 的基线是用 Chrome 155.0.8059.40 录的，固定版本下是否一致还没有在 Windows 上核对。
- 跨平台：文字栅格化在 macOS 与 Windows 上不同（同一提交上两边只有 6–10 % 的帧哈希相同，见 `scripts/regress.ts` 开头），
  不能逐像素比较。两台机器在同一提交、同一固定浏览器版本上各跑 `just sheet infotheory`，把两张 `out/infotheory/sheet/sheet.jpg`
  并排人眼对照：版面、字体、颜色应相同，只允许字形边缘的细微差别。
- `windows-reference/` 是 2026-10-03（64bcf17）的 Windows 样张，早于 1c 的字体替换、A2 的对比度修正和显示标点，
  只作历史记录，不能拿来和现在的画面对照。`mac-frames/` 是 2026-10-23 在 28506f1 上的 macOS 样张（PNG 转为 JPEG 入库）。

## 需要人眼看的

- `spikes/0d-macos/frames/` 的三张样张：地平线（深蓝到暖色的天空、地平线光带）、章节页（米白纸面、墨线图表、中英文字）、
  转场帧。记下是否有黑块、错色、缺字或字体明显不同。
- `spikes/0d-macos/sample-*.jpg`：14 px 的小字是否清晰可读。

## 交回

把 `spikes/0d-macos/` 下的结果文件提交到新分支并对 `main` 开 PR；没有推送权限的话，打包发回。
在提交说明或消息里附上：哪些步骤失败、报错原文、人眼检查的结论、计时结果旁的负载。

## 参考：Windows 上的结果

| 项 | Windows（RTX 3060 Laptop，Chrome 154） |
|---|---|
| 0a 现状参数 | FAIL（加速 2D canvas 依赖渲染顺序；GPU 地平线偶发 ±1） |
| 0a CPU 2D canvas | PASS |
| 0b check | PASS（JPEG 与 PNG） |
| 0b export：现有片 `surprise`，4 worker | 冷 56 秒（9.6 帧/秒），内存峰值约 620 MiB/worker |
| 0b export：诊断录屏 90 秒，4 worker | 冷 104 秒（26 帧/秒），内存峰值约 1080 MiB/worker，条码序列正确 |
| 0c | 帧间隔中位数 11.6 ms；1920×1080 DPR 1 实得 1920×1080；1280×720 DPR 2 实得 1280×720；点击时延 16–54 ms |
| GPU 检查 | 全部具备，样张见 `windows-reference/`（历史记录，见上） |
