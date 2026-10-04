# 计划：从一部片子到可复用的 demo 视频引擎

状态：草案 r3（已按两轮 Codex 评审修订）· 2026-10-03

## 目标

一个引擎做很多部 hackathon 项目的 demo 演示视频：风格有辨识度、美观，可在多套风格之间切换。
生产方式是人用自然语言描述，coding agent（Claude Code / Codex）整理输入、生成分镜与场景、渲染、自检、修改。
远期目标是端到端批量生成不同主题的片子；本计划的终点是：**第二部片子从 brief 做到成片，引擎相对固定基线无改动，场景由计划驱动而不是硬编码。**

协作环境：Windows + macOS，两人。

## 已定的方向

- **保留现有渲染内核**（Canvas2D + WebGL2、`frame(t)` 纯函数、headless Chrome 精确帧、ffmpeg），前提是阶段 0 的决策门通过。
  Revideo（MIT，0.11.0）是备选。Remotion 不作为核心：它使用自定义许可（当前 LICENSE.md 对个人、≤3 名员工的营利组织、非营利组织免费，其余需公司许可；5.0 条款待生效），
  我们更想要宽松许可且保留现有 WebGL 管线。
- **IR 先行，代码后生成**：`film-plan.json` 是场景顺序、ID、时长、文案、素材引用的唯一来源；场景代码按计划中的 ID 注册，校验保证两者一致。
  agent 决定"想做什么"，校验决定"什么是合法的"。
- **不自建 agent 运行时**：agent 就是 Claude Code / Codex。仓库提供的是接口：输出 JSON 的 `just` 命令、Zod schema、AGENTS.md、项目 skill。
- **旁白是 demo 片的默认主时钟**，场景时长取 `max(旁白 + 留白, 必须展示的素材段)`；节拍网格降为风格包里的可选项。
- **生产渲染不使用系统字体**：OFL 字体随仓库分发，CJK 按片子子集化，并校验实际文本的字形覆盖。
- **2D canvas 固定走 CPU 光栅化**；WebGL 有两条路径：GPU（生产，快）与 SwiftShader（回归，逐像素确定）。依据见 0a 与 `spikes/RESULTS.md`。
- 继续用 bun / vite / uv / just；不改成 Rust，不引入 mise。

## 非目标

自建 agent 运行时或工具协议；迁移到 Remotion；生成式音乐替代程序化配乐；Windows 与 macOS 输出字节一致；
从参考视频自动提取风格；完整的非线性编辑 GUI；一次建很多套风格；批量调度。

## 全局契约

从阶段 1 起生效，后续阶段只扩展、不推翻。

**时间。**
- 权威单位是影片帧号（整数，`fps` 由 film 声明）。场景区间半开 `[start, end)`。
- 解析按场景顺序**累计**进行：先算每段的帧数，再累加得到起点，不对累加后的秒数取整。
- 普通时长 `d` 秒取 `round(d × fps)` 帧（0.5 向上）；"必须完整展示"的时长（素材段、最低展示时长）取 `ceil(d × fps − 1e-9)` 帧；结果为 0 帧的场景是 error。
- 锚点（"某词开始后 Δt"）取 `floor(t × fps + 1e-9)`，落在所属场景之外是 error。
- 片尾 tail 归最后一个场景所有（与现状一致：`sources.len` 已含 4 秒 tail），影片总长等于各场景帧数之和。
- 解析结果写成 `timeline.json`（场景 ID、起止帧、秒数、fps），TS 渲染与 Python 配乐都只读它。仓库附一份含非整帧时长的期望 `timeline.json` 作为测试样例。

**子帧与素材帧。** 运动模糊的子帧只影响镜头、矢量绘制和叠加层；视频素材的源帧号只由输出帧号决定，不随子帧变化。

**色彩。** 工作空间是 sRGB 编码值，混合也在 sRGB 编码值上进行（保持现有外观）；成片标记 BT.709、limited range，ffmpeg 转换参数显式写出。
改用线性空间混合属于视觉变更，不在本计划内。

**诊断。** 所有校验类命令输出 `{ level, code, path, message }` 列表；有 error 时退出码非零。

**导出产物。**
- 先写作业私有的临时文件；通过检查（帧数、时长；有音轨时音轨不短于视频）后才原子替换正式文件；失败时旧文件保留、临时文件删除。
- 默认必须有音轨；无声导出必须显式 `--noaudio`。
- 同一输出路径的并发导出：后启动者立即失败（锁文件）。正常重跑在成功时覆盖旧文件。
- 任何失败（worker 启动失败、编码器失败、中断信号、超过截止时间）都在限定时间内退出，且不遗留 Chrome / ffmpeg 子进程。

## 阶段与验收

每个阶段写明命令、产物、退出条件、失败用例。每个阶段一到数个 PR。

### 阶段 0 · 验证（本 PR，不改 `src/`、`scripts/`、`audio/`）

实验代码放 `spikes/`，结果写入 `spikes/RESULTS.md`，含机器、操作系统、Chrome、GPU 后端、ffmpeg 版本。
参考机器：Windows 11、RTX 3060 Laptop、Chrome（ANGLE D3D11）。

**0a · 基线确定性。**
命令：`bun spikes/0a-determinism/run.ts`（GPU）与 `ANGLE=swiftshader bun spikes/0a-determinism/run.ts`。
在源码等同 `421b107` 的构建上，通过导出钩子渲染并对 canvas 原始 RGBA 求哈希（不经 JPEG/PNG 编码）。
覆盖：冷启动两次正序、乱序加重复 seek、4 个 worker 轮转；帧集合为首末帧、每个场景边界前后各一帧、每 5 秒一帧。
结果（已完成，详见 `spikes/RESULTS.md`）：现有导出路径**不是**逐像素确定的，有两个独立来源：
1. 硬件加速的 2D canvas：结果依赖渲染顺序（乱序、多 worker 时不一致），GPU 与 SwiftShader 下都出现。关闭 2D canvas 加速后消失。
2. GPU（D3D11）上的 WebGL 地平线着色器：偶发 3–6 个像素差 1 个色阶，与顺序无关，随机出现。SwiftShader 下未观察到。
SwiftShader + CPU 2D canvas：79 帧 × 4 组运行全部一致。GPU WebGL + CPU 2D canvas：页面场景一致，地平线帧仍有来源 2 的偶发差异。
据此：阶段 1 起所有启动器都带 `--disable-accelerated-2d-canvas`（1a 实测 `willReadFrequently: true` 不等价：与基线有约 200 帧不同，且仍依赖渲染顺序，已放弃）；回归在 SwiftShader 上做；
GPU 路径只用于生产，差异上限按来源 2 记录。

**0b · 录屏素材嵌入。**
诊断素材：ffmpeg 生成 90 秒 1080p30 视频，每帧含帧号条码，另含灰阶、色块、细字样片；预先拆成固定帧率的图片序列（PNG 与 JPEG q95 各一份）。
诊断场景不加淡入淡出、遮挡或调色，保证条码可读。场景按输出帧号取源帧，按需加载并使用有上限的缓存（不全量解码；全量 RGBA 约 21 GiB/worker）。
验证：
1. 源帧选择：关闭运动模糊，每个输出帧解码出的条码等于期望帧号；覆盖首帧、末帧、跨场景、随机与逆序 seek。
2. 子帧：开启运动模糊时，调试钩子记录每个子帧实际取用的源帧号，断言**每个都等于独立计算的期望值**（由输出帧号得出）。
3. 累积：已知色块的加权平均与理论值误差 ≤ 1/255。
4. 编码链路：完整导出成 H.264 后解码，读出的帧号序列等于 `0..N−1`，帧数等于 N。
性能矩阵：{1, 4} 个 worker × {冷缓存, 热缓存}，统计口径固定为"从启动导出到 ffmpeg 退出"的墙钟时间，内存为每个 worker 的 Chrome 进程树工作集峰值。
基准：同一矩阵下现有 `surprise` 场景（18 秒，纯页面）的导出。
预算（参考机器）：
- 4 worker 冷缓存导出 90 秒录屏诊断片 ≤ 10 分钟；
- 录屏场景吞吐 ≥ 基准场景的 50%；
- 每个 worker 内存峰值 ≤ 2 GiB；冷启动到首帧 ≤ 10 秒。
失败分支：先区分瓶颈在加载、解码还是合成；再试 WebCodecs `VideoDecoder`（同一套验收与预算）；仍不通过则开 Revideo 评估。

**0c · Playwright 录屏。**
用 `page.screencast.start({ onFrame, size, quality })` 录制本地测试页（CSS 动画、滚动、点击）。
`size` 是保持纵横比的**最大**尺寸，因此固定两组配置：viewport 1920×1080 / DPR 1，viewport 1280×720 / DPR 2，`size` 均设 1920×1080，记录实际 JPEG 尺寸，坐标映射以实际尺寸为准。
不用 `path` 方式：当前发布版 1.63 的 webm 固定 25fps，`fps` 选项要到 1.64。
测试页在每次点击时于画面内显示帧内条码，用来独立验证对齐。事件记录 DOM `pointerdown` 时刻（`performance.timeOrigin + event.timeStamp`），与帧时间戳同一时钟。
退出条件：
- 动画期间帧间隔中位数 ≤ 34 ms，p95 ≤ 50 ms，最长停顿 ≤ 100 ms（画面静止时浏览器不出帧，不计入）；
- quality ≥ 90 时 14 px 文字可读（记录样张，人眼确认）；
- 事件到首个显示该事件的帧的时延 ≤ 66 ms；重采样为 30fps 后，偏差在 [0, 2] 帧之内
  （r3 原为"偏差 ≤ 1 帧"，因不可达而修订：任何非零的输入→绘制时延加上重采样量化都可能产生 2 帧偏差，见 `spikes/RESULTS.md`）。
失败分支：这是录制问题，不是渲染器问题。替代录制方式（直接调用 CDP screencast、系统录屏）必须通过同一套 0c 退出条件。

**0d · macOS 实机。**
协作者在 macOS 上运行 `spikes/` 中的短样片（含 WebGL 背景与录屏素材），记录 GPU 后端、扩展可用性、帧率与画面是否正常。
实验脚本按平台选择 ANGLE 后端（Windows 用 `d3d11`，其他平台交给浏览器默认），启动时检查 WebGL2、`EXT_color_buffer_float` 与 framebuffer 完整性，缺失即报错。
0d 可与阶段 1 并行，但阶段 1 合并前必须完成。

**决策门。**
- 0a、0b、0c 全部通过 → 保留自研渲染器，进入阶段 1。
- 0b 在 WebCodecs 备选下仍不通过 → 带数据重新讨论渲染器，阶段 1 暂停。
- 0c 不通过 → 只更换录制方式，替代方式通过 0c 后继续。
- 0d 暴露的平台问题进入 1c 的修复清单。

### 阶段 1 · 分层重构（骨架改动，阶段 0 后再确认）

分三个 PR，严格区分"纯搬迁"和"行为变化"。回归一律在 SwiftShader 路径上比较原始 RGBA。

**1a · 纯搬迁，逐像素一致。**

```
engine/          与片子无关：时间、帧管线、绘图原语、WebGL、导出、校验
styles/<id>/     风格包
films/<id>/      一部片子：film.ts、scenes/、score.py
```

- 依赖方向 `films → styles → engine`，由导入检查脚本强制。
- 风格包接管：色板（语义名）、字体、纸面与背景着色器、版式网格、章节装饰、字幕位置与样式、调色参数、转场、动效。
- 场景只通过引擎公共 API `engine/index.ts` 访问风格与原语（1a 实现为模块门面，没有单独的 `SceneContext` 类型），不直接 import 引擎内部，也不直接调用 `paper()`、`glDraw(3)`。
- 契约：`FilmSpec`、`SceneSpec`（Zod）。
- 最小视觉校验：`text()` 等文字原语记录经当前变换后的边界框；`just validate <film>` 检查文字是否超出画面与安全区（四边各 5%）。
  检查帧集合为每个场景的 0%、25%、50%、75%、末帧；这只是抽样，不保证动画中间态。

命令：`just regress [--film <id>]`（SwiftShader 渲染回归帧并与基线哈希比较）、`just validate [--film <id>]`、`just check-imports`（1a 只有 infotheory 一部片；工具会核对页面实际渲染的影片 ID）。
产物：`out/regress/<film>/report.json`、`out/validate/<film>.json`。
退出条件：0a 的帧集合加每秒一帧的全片抽样，与 `421b107` 的原始 RGBA 逐像素一致；导入检查通过；`validate` 无 error。

1a 实施记录（分支 `engine/1a-split`）：
- 全部退出条件已满足：回归 231 帧逐像素一致（每一步提交后都跑过），`check-imports`、`tsc --noEmit` 通过，`validate` 0 error。
- 安全区越界改为 warning（`--strict` 时为 error），越出画面仍是 error。原因：`validate` 在现有片中发现 7 处文字越过右侧 5% 安全区
  （entropy、noise、capacity 的图表标签，仍在画面内），修排版会改变像素，不属于纯搬迁。2026-10-03 确认：1a 维持 warning，
  排版在 1c 作为列明的行为变化修掉，修完后安全区恢复为 error。
- 已知怪异行为照旧保留，留给 1b：`fi = 0` 依赖 NaN 关闭淡入；`fi > 0` 时场景首帧完全被淡入色覆盖；`sources` 起点为 `192.60000000000002`。

**1b · 时间轴与音频（行为变化，单独记录）。**
- 场景只声明时长，起点按全局契约累计解析；输出 `timeline.json`。tail 仍归 `sources`，不拆分。
- 浮点边界修正：现有 `sources` 起点为 `64.2 × 3 = 192.60000000000002`，解析后为第 5778 帧整，第 5778 帧从 `morning` 改归 `sources`。
  列出全部受影响的帧并人工确认。
- 配乐读取 `timeline.json` 的场景区间，编曲以"场景 + 场景内小节"定位，不再用全局小节号。
- 配乐输出经过最终处理（loudnorm 两遍 + limiter）的 WAV 母版；预览 MP3 与成片 AAC 都由它派生。
- `just music` 依赖 `just cues`。

命令：`just timeline <film>`、`just regress <film>`、`just music`。
退出条件：总帧数不变（6060 帧，202 秒）；除已列出的帧外逐像素一致；母版 WAV 的时长等于影片时长，积分响度 −16 LUFS ±0.5，真峰值 ≤ −1.5 dBTP。

1b 实施记录（分支 `engine/1b-timeline`）：
- 场景声明 `dur`（秒；本片写成 `bars(n)`），`FilmMeta` 改为 `{ id, fps, bpm, chapters }`，起点按帧累加；`tail` 留在 `sources` 的时长里（`bars(1.8) + 4`）。
- 受影响的帧只有第 5778 帧：从 `morning` 的最后一帧变为 `sources` 的第一帧，两者都是完全淡到米白的过渡帧，切点提前一帧，目视无差别。回归在更新基线前恰好报这 1 帧不同，基线已重录。cue 表不变（134 条）。
- 淡入淡出改为显式分支（`fi`/`fo` 为 0 即无淡化），本片无 0 值，像素不变。`fi > 0` 时场景首帧为纯淡化色，这是淡入的本意，保留。
- 配乐拆为 `audio/synth.py`（可复用）与 `films/infotheory/score.py`（编曲，`at(scene, bars)` 定位并对齐到采样点）；拆分后未母版化的混音与旧 `music.py` 逐字节相同。
- 母版：`audio/music.wav` 202.000 s，−16.00 LUFS，真峰值 −7.20 dBTP（loudnorm 复测 −16.00 / −7.23）；`score.py` 在超标时直接失败。导出改用 WAV 母版。

**1c · 导出可靠性、字体、平台（行为变化）。**
- 导出：实现全局契约中的导出产物规则；去掉 `-shortest`。
- 色彩：输出显式标记 BT.709 / limited range。
- 平台：ANGLE 后端按平台选择；启动时检查 GPU 能力；着色器编译失败即报错。
- 字体：OFL 字体随仓库分发；按 film 声明的字符集子集化；用 fonttools 校验实际文本（字幕、场景文字、动态数字的字符集）的字形覆盖；
  删除"15 秒后强制就绪"的逻辑，字体缺失、损坏、缺字、超时都让导出失败。
- README 修正"预览与导出逐帧一致"的说法（预览 1 个子帧，导出 3 个）。
- 排版（行为变化，单独提交）：在字体替换之后修正越过 5% 安全区的文字（1a 时为 entropy、noise、capacity 的 7 处图表标签；换字体后以 `validate` 实际结果为准），
  列出改动的场景与样张；然后把 `validate` 的安全区检查恢复为 error（去掉 warning 默认）。

失败用例（每个都要检查：退出码非零、限定时间内退出、无遗留子进程、旧成片保留、临时文件已删除）：
短音频、缺音频且未加 `--noaudio`、worker 启动失败、编码器失败、中断信号、超过截止时间、同路径并发、缺字。
退出条件：失败用例全部符合预期；Windows 与 macOS 都能预览和导出短样片；字体替换后的样张经人眼验收；安全区恢复为 error 后 `validate` 0 error。

1c 实施记录（分支 `engine/1c-export`）：
- 导出：作业私有临时文件 + 校验（帧数、时长、音轨及长度、色彩标记）后才替换成片；锁文件防并发；默认要求音频（`--audio` 指定，`--noaudio` 无声）；去掉 `-shortest`；`--deadline`；失败、中断都关闭或强杀 Chrome 与 ffmpeg。`scripts/test-export.ts` 8/8 通过（缺音频、音频过短、启动失败、编码失败、中断、超时、并发、成功），遗留进程检测经运行中实测有效（18 → 0）。Windows 上无法向子进程发送 SIGINT，中断用例走 `--abort-after` 钩子，与 SIGINT 处理同一路径。
- 色彩：canvas JPEG（全范围 BT.601）转为有限范围 BT.709 并打标记。实测 ffmpeg 默认的 swscale 舍入会带来 2–6 个色阶的系统偏差，改用 `accurate_rnd+full_chroma_int+full_chroma_inp` 后，成片按标记精确解码与 canvas PNG 的块平均色差为 0.52 个色阶（旧管线 0.24–0.50；旧管线在 ffmpeg 9 下其实已自动标记为全范围 BT.601，但全范围 H.264 的播放器兼容性较差）。
- 平台：ANGLE 后端按平台选择（只有 Windows 强制 D3D11），三处启动参数合并到 `scripts/chrome.ts`；缺 WebGL2、缺扩展、半浮点 framebuffer 不完整、着色器编译或链接失败都抛错（反例：着色器语法错误时 `validate` 立即失败）。
- 字体：`styles/paper-dawn/fonts.lock.json` 锁定 google/fonts @9710da1 的来源与 sha256；`just fonts` 下载到 `.cache/fonts`、裁剪子集（共约 410 KiB）并写 manifest，重跑结果逐字节相同。页面只加载这些字体，任一加载失败则 `__ready()` 抛错；删除 15 秒强制就绪。`text()` 按字体链逐字检查覆盖，缺字直接抛错（预览、validate、导出都生效）。Georgia → Gelasio（字宽兼容），Cambria Math → STIX Two Text + STIX Two Math，Consolas → Inconsolata。所有字体都不含 ₚ，黑洞熵公式改写为等价的 `S = kc³A / 4Għ`。反例：缺字、字体文件损坏、字体文件缺失都按预期失败。
- 排版：章节标签英文部分按标题实际字体量宽度后摆放（原来会重叠，如 无处不在 / EVERYWHERE）；entropy 注释列左移 50 px；capacity 的 S/N (dB) 移到轴下方。安全区恢复为 error，`validate` 0 error、0 warning。
- 回归基线重录两次：字体替换（194/231 帧变化）、排版修正（147/231 帧变化），每次都先看新旧样张。
- 未完成：macOS 上的预览与导出（0d，等协作者）。

**风格解耦验收（1a–1c 完成后）。**
第二套风格包（由 `nebula` 背景扩展而来，色板、字体、版式、转场均不同），用页面场景与全幅背景场景两类代表场景验证：
不改场景代码即可切换；`just validate` 无 error；人眼确认两套风格可明显区分。

### 阶段 2 · demo 片基础能力

分三个 PR。

**2a · 录屏合成。**
- 契约：`CaptureAsset`（帧序列、帧时间戳、viewport、DPR、实际帧尺寸、`events.jsonl`；`events.jsonl` 可选），与录制方式无关。
- 两种录制来源，产出同一种 `CaptureAsset`：
  - **Playwright 脚本录制**（网页 demo 的默认方式）：`page.screencast` 的 `onFrame` 帧加 DOM 事件（目标元素、边界框），同一时钟；
    viewport = 输出分辨率、DPR 1（0c）。
  - **视频文件导入**（OBS 或任何录屏，用于原生应用、终端、模拟器、人工操作的演示）：ffmpeg 拆成固定帧率 JPEG 序列，
    帧时间戳由帧号推出；默认没有事件，镜头关键帧与点击效果在场景里手动指定。若另有输入记录（JSONL，自带时钟），提供一个已知同步点的对齐参数。
- 时间映射：录制时间 → 素材时间（裁剪、删除空闲段、变速）→ 影片时间。删除区间半开；落在删除区间内的事件丢弃并输出 warning；
  变速后源帧取 `floor(映射后的源时间 × 源 fps + 1e-9)`。
- 坐标映射：viewport × DPR → 实际帧像素 → 输出画面（含镜头缩放平移）。
- BrowserDemo 场景：镜头规划（缩放、平移、跟随）、合成光标、点击波纹、窗口外观，参数全部来自风格包。

命令：`just capture <scenario>`（Playwright）、`just import-capture <video> [--fps 30] [--events <jsonl> --sync <录制时刻>=<视频时刻>]`、
`just validate <film>`、`just regress <film>`。
退出条件：
- Playwright 来源：分别覆盖裁剪、删除空闲段、变速、镜头缩放平移及其组合；每个用例中合成光标与页面内可见标记的位置偏差 ≤ 4 px，
  点击效果落在事件所在帧，页面标记在其后 [0, 2] 帧内出现（与 0c 的时延标准一致）；
- 导入来源：一段 OBS 录制（或等效录屏文件）经 `import-capture` 后，用手动镜头关键帧做成 BrowserDemo 场景并导出；
  帧数等于 `round(时长 × fps)`，无重复帧以外的跳帧（用带帧号的测试视频验证）；
- BrowserDemo 在两套风格下都通过风格解耦验收。

**2b · 旁白、时间轴与最终混音。**
- 契约：`Script`（分段、稳定 token ID、读法规范化映射）、`Alignment`（token ID → 起止时刻，含所属分段的音频偏移）。
- TTS 适配层：本地 Kokoro（英文）与一个云端后端；时间戳优先取 TTS 自带的，没有则对已知文本做强制对齐（WhisperX）。
- 锚点引用 token ID，不引用字符串。数字、金额等无法得到词级时间时降级为句级并输出 warning；被引用的锚点缺失则报 error。
- 场景时长 = `max(旁白 + 留白, 必须展示的素材段)`，按全局契约量化。
- 音乐适配：垫乐循环、切点落在最近的小节线、旁白时压低音乐。
- **最终母版**由旁白、配乐、音效混合后统一做响度处理；导出只引用这个母版。

命令：`just narrate <film>`、`just align <film>`、`just timeline <film>`、`just mix <film>`。
退出条件：
- 含版本号、金额、重复术语的测试文案，全部得到有效锚点或明确降级；
- 旁白 2 秒而素材 5 秒的用例按规则延长场景，素材不被截掉；
- 最终母版中每段旁白在其对齐时间窗内可检出（窗内 RMS 高于窗外垫乐 ≥ 6 dB）；积分响度 −16 LUFS ±0.5，真峰值 ≤ −1.5 dBTP。

**2c · 计划驱动与 agent 命令。**
- 契约：`Brief`、`FilmPlan`（Zod，可导出 JSON Schema）。`films/<id>/film-plan.json` 是场景顺序、ID、时长、文案、字幕、素材引用的唯一来源；
  `film.ts` 从它构建影片，场景模块按计划中的 ID 注册。
- `just plan-check <film>`：schema、引用（素材存在、场景模块与计划 ID 一一对应）、文案只来自计划。
- `just scaffold <film>`：为计划中新增的场景生成模块骨架；不覆盖已有模块。
- `just validate` 扩展：cue、字体覆盖、素材、token 引用、对比度（文字与背景采样的 WCAG 对比度 ≥ 4.5，大字 ≥ 3）。
- `just thumbs <film>`（缩略图拼板）、`just render-scene`、`just render-range`，均输出 JSON 摘要与产物路径。
- 素材清单：每个非代码素材记录来源、许可证、sha256、生成模型与种子。

退出条件：每条校验规则至少有一个会触发它的失败用例；非法计划在生成场景之前就被 `plan-check` 拒绝；
agent 只用这些命令就能完成"改计划 → 生成或修改场景 → 看拼板 → 修正"的一轮。

### 阶段 3 · agent 接口与实战

- AGENTS.md（Claude 与 Codex 共用；CLAUDE.md 只指向它）：分层约定、契约、命令、如何加场景、风格规则、验收清单。
- 项目 skill：brief → film plan → 场景 → 渲染自检 → 修改。
- 实战：一个真实 hackathon 项目，60–90 秒，含录屏、旁白、配乐、字幕。

退出条件：
- 引擎无改动：`git diff <阶段 2 合并提交> -- engine/` 为空；
- 仓库保留全过程产物：`brief.json → film-plan.json → scenes/ → thumbs → validate 报告 → 修改记录`；
- 对 brief 做一次实质修改（增删一个场景、改一段旁白），重新生成后计划与成片相应变化，且 `plan-check`、`validate` 通过；
- 一份故意写错的计划（引用不存在的素材、重复场景 ID）在生成前失败。

## 风险

| 风险 | 缓解 |
|---|---|
| 录屏嵌入的吞吐或内存不可接受 | 0b 带预算与矩阵实测；备选 WebCodecs，再备选 Revideo |
| Playwright 录屏帧率不稳 | 0c 带阈值实测；失败只换录制方式 |
| 渲染非确定性（已实测两个来源） | 2D canvas 固定 CPU 光栅化；回归在 SwiftShader 上做；GPU 只用于生产，差异上限有记录 |
| 重构引入不可见的画面变化 | 原始 RGBA 逐像素回归；纯搬迁与行为变化分 PR |
| 跨平台字体与 GPU 差异 | 字体随仓库并校验覆盖；按平台选后端；0d 实机；正式成片在固定环境渲染 |
| 模型与素材许可证 | 素材清单必填许可证；默认只用许可明确的模型 |
| 引擎越长越杂 | 依赖方向强制；新原语进 engine 前必须有两部片子用到 |

## 待确认

- 阶段 1 开始前：阶段 0 的数据与决策门结论（0a–0c 已完成，见 `spikes/RESULTS.md`）。
- 录屏一律用 viewport = 输出分辨率、DPR 1（0c 实测 DPR 2 不提高录制分辨率）。
- 0d 需要协作者在 macOS 上配合运行。
- 字体选择需人眼看样张；字体等素材文件的下载逐项确认。
