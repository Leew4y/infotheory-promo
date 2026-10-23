# 讲解片 / 演示片引擎

用代码做短片：画面由 TypeScript 在 Canvas2D 与 WebGL2 上逐帧绘制，headless Chrome 按精确帧时刻导出，ffmpeg 编码；
配乐与音效由 Python 合成，旁白由本地 CosyVoice3 合成。人描述片子、做方向选择、看拼图和成片；
coding agent（Claude Code / Codex）按 `AGENTS.md` 和 `.claude/skills/` 写计划与场景、渲染、自检、修改。

仓库里的片子：

| 片子 | 内容 |
|---|---|
| `films/infotheory` | 参考片：信息论，3 分 22 秒，横屏，两套风格（说明见 `films/infotheory/README.md`） |
| `films/math-lessons` | 带旁白的长片（5 分 18 秒），带研究资料、事实核查与评审记录 |
| `films/raa-demo` | 产品演示：录屏、旁白、配乐 |

## 在 Mac 上开始（Apple 芯片）

```
just mac-setup     # brew bundle（bun、just、ffmpeg、uv、speech）→ bun install + uv sync → 旁白模型 → 环境检查
just doctor        # 只检查不安装：每一项缺什么、用什么命令补
```

第一次没有 just 时，先 `brew bundle --no-upgrade`。浏览器由 `just browser`（`just setup` 会运行它）下载固定版本的 Chrome for Testing
（155.0.8059.85，按 sha256 校验）到 `.cache/chrome/`：两台机器用同一个构建，不会因自动更新改变像素，也没有更新程序进程；
所有工具优先用它（`CHROME_PATH` 最先），没装时才退回本机安装的 Chrome 并提示像素可能与基线不同。
在 M5 Pro 上实测（2026-10-23）：整部参考片 6060 帧带音频导出 2.0 分钟（约 50 帧/秒）；一句旁白的合成时间约为其时长的 0.2–0.3 倍。
Windows 上的命令相同（just 在 PowerShell 里运行），旁白走 PyTorch + CUDA；Mac 与 Windows 的实测对照在 `spikes/0d-macos/RESULTS.md`。

## 做一部片子

完整步骤与检查清单在 `.claude/skills/make-film/SKILL.md`（agent 照它做）。最短路径：

```
just new-film demo keynote --plan            # 横屏 1920×1080；加 --portrait 得到竖屏 1080×1920（手机）
# 写 films/demo/brief.md 与 film-plan.json：场景顺序、每句旁白（text 字幕、read 读法）、画面文案
just plan-check demo && just scaffold demo   # 校验计划；为新场景生成模块
just narrate demo                            # 合成旁白（每句一个 FLAC 与 lock，入库）
just fonts demo                              # 按片中用字裁剪字体子集（改了文字就要重跑）
just render-scene demo idea --draft          # 无声草稿，几秒钟看一个场景
just validate demo && just sheet demo        # 版面、对比度、字形检查；代表时刻拼图
just texts demo                              # 片中全部画面文字与旁白，供核对事实
just mix demo --music none                   # 最终混音（有 score.py 时先 just music demo）
just export demo                             # 成片 → out/demo/demo.mp4
```

### 画幅与分辨率

- 片子的画幅由 `film-plan.json` 的 `"size": [1080, 1920]`（或 `defineFilm({ size })`）决定，默认 1920×1080。
  场景按 `W`、`H`、`M`、`COL` 和 `portrait()` 排版；paper-dawn、nebula、keynote 和风格模板都有竖屏版式：
  一栏、边距 90，字幕放在画面下四分之一之上（手机应用在最下面放自己的文字和按钮），风格自带的字号放大 1.3 倍。
- `just export demo 4 18 --res 2160`：按短边像素导出（16:9 的 1440 → 2560×1440，2160 → 3840×2160；竖屏 2160 → 2160×3840；720 可做小预览）。
  页面按这个倍率重新绘制文字、线条和着色器，不是放大；录屏素材按录制时的像素绘制。validate、regress、拼图始终在 1 倍下运行。
- `--for x`：发 X 用的版本，码率上限 20 Mbit/s，超过 140 秒或 512 MB 时提醒（X 无 Premium 账号的限制，记录于
  `films/math-lessons/review/09-social-review.md`）；`--maxrate <Mbit/s>` 自定码率上限。

### 旁白与音色

| 音色 | 说明 |
|---|---|
| `zh-female-warm` | 温柔知性的成熟女声（御姐音，The-Walls 2026-10-23 选定），由文字描述设计生成；新计划片默认用它 |
| `zh-male-professor` | 低沉稳重的男教授声（Develata 2026-10-10 选定）；math-lessons、raa-demo 用它 |
| `cosyvoice-zero-shot` | CosyVoice 自带示例；只用于测试 |

- Mac：`cosyvoice3-mlx` 后端，同一个 Fun-CosyVoice3-0.5B 模型的 MLX 版，经 `speech` 命令运行；同一种子重复合成逐字节相同。
  用男教授音色读同一句，MLX 版与 Windows 上 PyTorch 版的说话人相似度 0.89–0.90（PyTorch 版自己两句之间为 0.86）。
- lock 里每句记录合成它的后端：在另一台机器上打开片子，已提交的旁白全部保留，只有改了读法的句子用本机后端重新合成。
- 找新音色：`just voice-design my-voice --describe "A=<一句描述>" --describe "B=..."`，听 `out/voice-design/my-voice/*-sample.mp3`
  （CosyVoice3 克隆后读同一段旁白），选好后 `just voice-design my-voice --pick A` 写入 `voices/my-voice/`（附生成来源、许可与可复现的参数）。
  设计出来的音色不是真人录音，也不克隆任何人的声音。
- `zh-female-warm` 实测一句之内约每秒 5 个汉字；旁白稿按此估算片长，一句不超过约 45 字。

## 命令一览

所有片子相关的命令第一个参数是片名（省略时为 `infotheory`）；生成的东西都在 `out/<film>/`（不入库）。

```
just mac-setup / just setup / just doctor    # 安装 / 依赖（bun install、uv sync、just browser）/ 环境检查
just browser                  # 固定版本的浏览器 Chrome for Testing → .cache/chrome/（按 sha256 校验；已装好则跳过）
just new-film demo nebula [--plan] [--portrait]   # 从模板新建片子；films/demo/ 已存在但只有先写的材料（brief.md、research/、script/、review/）时，把模板加进去，原有文件不动
just new-style ink-wash       # 从模板新建风格包 styles/ink-wash/（含 STYLE.md 设计说明骨架）
just plan-check demo [--json] / just scaffold demo / just plan-schema
just narrate demo [--resynth ids|all]        # 合成旁白；just tts-setup 安装旁白模型（Mac：MLX 版约 2.3 GB；Windows：PyTorch 版约 5.4 GB）
just voice-design my-voice --describe "A=..." | --pick A      # 按描述设计音色、试听、入库（Apple 芯片）
just import-capture demo app ~/rec/app.mp4 [--store-source]   # 把录屏导入为素材 app；--store-source 把源视频（≤ 25 MB）放进 films/demo/captures/sources/ 一起入库
just capture demo web demo-scenario.ts       # 用 Playwright 按脚本录制网页演示，同时记录点击
just captures demo [dir]      # 换机器或清了缓存后，从源视频重建素材帧（按 sha256 校验；默认目录 films/demo/captures/sources/）
just fonts demo               # 字体子集（每个风格一套）；生成前检查中文字形（两个字画成一样、字腔被填实、标点按西文排），有错就停，旧子集不动
just glyphs demo              # 字形校样：用随仓库的字体子集把片中每个字逐字画出（48 px，标码位，旁边是系统字体的同一个字）→ out/demo/glyphs/<style>/；换字体后要逐格看过
just glyph-check <字体 id> --film demo   # 字形检查单独跑（不生成子集），选字体前先查；字体库里记了 defects 的字体（如 ZCOOL XiaoWei）只有风格的 fonts.json 写明 acceptDefects 理由（须经本人同意）才能用
just dev demo                 # 预览 http://127.0.0.1:5174：空格播放/暂停，←/→ 5 秒，, . 单帧，[ ] 跳场景，F 全屏；?style=<id> 切换风格
just render-scene demo idea --draft / just render-range demo 1 3 --draft   # 无声局部，stdout 一行 JSON 摘要
just shots demo 5,20.5        # 检查帧 → out/demo/shots/
just sheet demo               # 拼图：代表时刻 × 每个风格 → out/demo/sheet/sheet.jpg（--style a,b；--times t1,t2）
just sheet-compare demo paper-dawn,nebula   # 拼图里加上片子没用的风格（构建期间临时改动，构建完逐字节恢复）
just texts demo               # 全部画面文字与旁白 → out/demo/texts.md
just validate demo            # 所有风格：声明、时间轴、渲染、出画面、出 5% 安全区、文字重叠、WCAG AA 对比度、显示标点
just cues demo / just music demo / just mix demo [--music file|none]   # 音效 cue 与时间轴 / 配乐 / 最终混音
just export demo [workers crf] [--res 2160] [--for x] [--maxrate 20] [--noaudio] [--style id]
just all demo                 # cues → music → mix → export
just check / just check-imports / just test   # 类型检查 / 依赖方向 / 单元测试
just regress demo [--update]  # 像素回归，每个风格、每个平台一份基线
just test-validate / just test-plan / just test-narration / just test-capture / just test-export infotheory
just font-catalog             # 下载并校验字体库（约 80 MB）；新增字体须经确认后用 --lock 登记
```

预览需要 `out/<film>/music.mp3` 或最终混音存在，否则页面按内部时钟播放、无声。

## 检查与回归

- `just validate` 在每个场景抽样 5 帧，按导出画面逐字检查：出画面、出 5% 安全区、文字重叠、对比度低于 WCAG AA 都是错误。抽样检查，不是逐帧证明。
- `just regress` 在 SwiftShader + CPU 2D canvas 下逐帧比较原始 RGBA 哈希。文字栅格化随操作系统不同（同一提交上 Mac 与 Windows 只有 6–10% 的帧哈希相同），
  所以基线按平台分开：`films/<film>/regress/<style>.<os>-<arch>.json`，每人在自己的机器上录本平台的基线。
  某平台还没有基线时，从一个确认无误的提交录：`git worktree add ../base <commit>`，在那里 `bun install && just build <film>`，
  再 `bun scripts/regress.ts --film <film> --dist ../base/dist/<film> --update`。改变像素的改动须先给人看前后对照，再重录基线。

## 工程结构

分三层，依赖方向 `films → styles → engine`（`just check-imports` 强制）。风格、字体、合成器、新片模板是可复用的库；
场景与配乐跟着内容走，留在各自的片子里。片子之间、风格之间不互相导入。计划与历次实施记录见 `docs/plan/reusable-engine.md`。

```
engine/               与片子无关：时间轴（film.ts）、风格接口（style.ts）、场景（scene.ts）、帧管线（frame.ts）、绘图（draw.ts）、
                      WebGL（gl.ts）、录屏素材与演示场景（capture.ts、demo.ts、media.ts）、旁白（narration.ts）、计划（plan.ts）、页面入口（boot.ts）
styles/<id>/          风格包：paper-dawn（纸与黎明）、nebula（星云）、vigil（夜祷，math-lessons）、keynote（浅色产品发布）
fonts/catalog.json    字体库（全部 OFL）：上游来源（固定到提交）、sha256、字重、许可证与选用标签；风格按 id 引用
voices/<id>/          音色：参考音频、文字稿、来源与许可
templates/            新片骨架（film、film-plan）与新风格骨架（style）
films/<id>/           一部片子：film.ts、main.ts、scenes/、film-plan.json、score.py、narration/、fonts/<style>/、regress/、brief.md、research/、review/
audio/                合成器（synth.py）、最终混音（mix.py）、TTS 适配层（tts.py）、音色设计（voice_design.py）
scripts/              工具：导出、校验、回归、字体、旁白、录屏、拼图、文字导出、环境检查
spikes/               阶段 0 与 macOS（0d）的验证实验与结果
index.html            所有片子共用的页面外壳；canvas 的像素尺寸由片子的画幅与导出倍率决定
Brewfile / justfile   macOS 工具清单 / 一键命令
```

## 它是怎么工作的

- **时间网格**：帧是权威单位。每个场景只声明时长 `dur`（秒，或由旁白决定），取整到帧，起点按注册顺序累加，没有空隙、不累积误差；
  文案、音效 cue、镜头运动都写成场景内的局部时间。`just cues` 写出 `timeline.json`，配乐按场景定位，跟着走。
- **确定性**：绘制函数只接收时间；随机数全部来自固定种子，颗粒由帧号播种。所有启动器都带 `--disable-accelerated-2d-canvas`：
  硬件加速的 2D canvas 会让像素依赖渲染顺序（`spikes/RESULTS.md` 0a；Mac 上同样如此）。导出（3 个运动模糊子帧）与预览（1 个子帧）不完全相同。
- **帧管线**：场景层画在 Canvas2D 上（单位是片子的画幅，按导出倍率放大到像素），上传到 WebGL 累积缓冲；导出时每帧 3 个子帧求平均得到运动模糊；
  随后是颗粒、暗角、调色、光晕；结果画回 canvas，最后叠加不受模糊影响的章节标签、页码和字幕。
- **导出**：N 个独立的 headless Chrome 渲染精确帧时刻，页面把 JPEG 发回本地服务器，按序写入 ffmpeg，转成 BT.709 limited range 的 H.264 + AAC；
  先写临时文件，帧数、时长、音轨、尺寸和色彩标记都核对通过才替换成片。
- **声音**：场景里的音效 cue 由页面汇总，`films/<film>/score.py` 用 `audio/synth.py` 的乐器按场景编曲；`audio/mix.py` 把旁白放在各句的时刻，
  配乐在旁白处压低，母版 −16 LUFS、真峰值 ≤ −1.5 dBTP，每句旁白比垫乐高至少 6 dB。
