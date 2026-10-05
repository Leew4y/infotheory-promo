# 0d · macOS 实机验证

阶段 0 的另外三项（0a 确定性、0b 录屏素材嵌入、0c Playwright 录屏）已在 Windows 上完成，结果见 `spikes/RESULTS.md`。
0d 在 macOS 上重跑同一批实验，确认引擎和工具链在另一个平台上能用，并记录差异。计划见 `docs/plan/reusable-engine.md` 的"0d"一节。

## 前置条件

- 分支 `plan/reusable-engine`（PR Leew4y/infotheory-promo#2）。
- bun、ffmpeg（在 PATH 上）、Google Chrome（安装在 `/Applications`；装在别处时设 `CHROME_PATH`）。
- 约 2 GB 空闲磁盘（诊断素材写到 `out/`，已被 git 忽略）。
- 跑性能测试时尽量关掉其他重负载程序，插电运行。

## 步骤

在仓库根目录依次运行。每一步都会把结果写进 `spikes/0d-macos/`。某一步失败时，记下完整报错，继续后面的步骤。

```bash
# 0. 环境信息
mkdir -p spikes/0d-macos
{ sw_vers; sysctl -n machdep.cpu.brand_string; sysctl -n hw.memsize; system_profiler SPDisplaysDataType | grep -E "Chipset|Metal"; \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version; ffmpeg -version | head -1; bun --version; } > spikes/0d-macos/env.txt 2>&1

# 1. 依赖与构建
bun install
bun run build

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

# 5. 0c Playwright 录屏
(cd spikes/0c-capture && bun install && RESULT_DIR=spikes/0d-macos bun run.ts)
cp out/0c-capture/sample-*.jpg spikes/0d-macos/
```

## 补充：在 1c 分支上（PR #5 合入前）

0d 的上述步骤跑完后，如果方便，再切到分支 `engine/1c-export` 跑一遍新的检查（字体已随仓库分发、导出有失败保护）：

```bash
git switch engine/1c-export && bun install && uv sync --project audio
just music                                                  # 生成 audio/music.wav（导出与失败用例都需要它）
bun run build
bun scripts/validate.ts                                    # 0 error 即通过
bun scripts/test-export.ts                                 # 全部 ok 即通过（macOS 上多一个真实 SIGINT 用例）
bun scripts/export.ts --from 30 --to 36 --out out/mac-1c.mp4
just dev                                                    # 打开 http://127.0.0.1:5174：字体加载完才能播放，画面应与 windows-reference 一致
```

把输出贴回即可；`just regress` 在 macOS 上会提示"基线不可比较"，这是预期的。

## 需要人眼看的

- `spikes/0d-macos/frames/` 的三张样张：地平线（深蓝到暖色的天空、地平线光带）、章节页（米白纸面、墨线图表、中英文字）、
  转场帧。记下是否有黑块、错色、缺字或字体明显不同。
- `spikes/0d-macos/sample-*.jpg`：14 px 的小字是否清晰可读。

## 交回

把 `spikes/0d-macos/` 下的所有文件提交到 `plan/reusable-engine` 分支并推送；没有推送权限的话，打包发回。
在提交说明或消息里附上：哪些步骤失败、报错原文、人眼检查的结论。

## 参考：Windows 上的结果

| 项 | Windows（RTX 3060 Laptop，Chrome 154） |
|---|---|
| 0a 现状参数 | FAIL（加速 2D canvas 依赖渲染顺序；GPU 地平线偶发 ±1） |
| 0a CPU 2D canvas | PASS |
| 0b check | PASS（JPEG 与 PNG） |
| 0b export：现有片 `surprise`，4 worker | 冷 56 秒（9.6 帧/秒），内存峰值约 620 MiB/worker |
| 0b export：诊断录屏 90 秒，4 worker | 冷 104 秒（26 帧/秒），内存峰值约 1080 MiB/worker，条码序列正确 |
| 0c | 帧间隔中位数 11.6 ms；1920×1080 DPR 1 实得 1920×1080；1280×720 DPR 2 实得 1280×720；点击时延 16–54 ms |
| GPU 检查 | 全部具备，样张见 `windows-reference/` |
