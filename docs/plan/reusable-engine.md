# 计划：从一部片子到可复用的 demo 视频引擎

状态：草案 r3（已按两轮 Codex 评审修订）· 2026-10-03；r4 插入阶段 A（多影片与 agent 风格设计）· 2026-10-07

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
- **每部片子的风格由 agent 按 brief 设计**（阶段 A）：风格包是代码，人做方向选择并看拼板；字体只从预先确认的 OFL 目录里选。

## 非目标

自建 agent 运行时或工具协议；迁移到 Remotion；生成式音乐替代程序化配乐；Windows 与 macOS 输出字节一致；
从参考视频自动提取风格；完整的非线性编辑 GUI；预先建一个大风格库（风格按片由 agent 设计）；批量调度。

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
0d 可与阶段 1 并行，原定阶段 1 合并前必须完成。
2026-10-07 修订（Develata 决定）：0d 未交回时先合并阶段 0–1，标注为"Windows 已验证、macOS 待验证"；0d 改在 `main` 上运行，
暴露的问题另开 PR 修复。理由：0d 可能暴露的问题集中在启动参数、GPU 后端与进程清理（`scripts/`），不涉及三层结构。

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
- 未完成：macOS 上的预览与导出（0d，等协作者；合并后在 `main` 上运行，见 0d 一节的修订）。

1c 评审修正（Codex，gpt-6-astra max：6 BLOCKER / 10 SHOULD_FIX，逐条核实后处理）：
- 关掉 puppeteer 自带的信号处理（它直接 `process.exit(130)`，跳过清理）；截止时间覆盖整个作业直到最终探测，取消时立即杀 ffmpeg / ffprobe 以解除阻塞的写入和探测，rename 前再查一次取消。
- 清理：ffmpeg 强杀并等待，Chrome 杀整个进程树（Windows `taskkill /T`，其他平台进程组），删除文件在 Windows 句柄未释放时重试，清理不了的会报告。父进程本身被硬杀不在保证范围内（需要外部监管或 Windows Job Object）。
- 锁：在启动任何东西之前获取；接管旧锁由第二把 `.break` 锁串行化，竞争下不会两方都成功；空锁 10 秒后才算旧锁；只有 ESRCH 才算进程不存在。
- ffprobe：检查退出码，所有字段必须存在且为有限数（N/A 判失败），探测有超时。导出区间按影片帧率对齐，音频裁到同一跨度，负区间、空区间拒绝。stat 移到 rename 之前。
- 色彩 transfer：不做转换，按惯例把 sRGB 编码值标为 bt709（屏幕 / 网页内容的通行做法），写进导出脚本头注释。
- 字体许可证：每个字体族的 OFL 全文随子集放在 `films/infotheory/fonts/LICENSE-*.txt`；子集保留全部 name 记录（版权、许可声明、链接）。
- 字体工具：字符扫描改为识别字符串的扫描器（不再吞掉 `https://`，正确解码 `\u` 转义，递归扫描模板里的 `${...}`），支持 `fonts.extra.txt`；下载与生成都先写临时位置，校验通过才替换，失败保留原字体；fontTools 4.66.1 / brotli 1.2.0 固定并写进 manifest。
- 字体链：链中每个字体族都必须是随仓库字体（不区分大小写），只有末尾的 CSS 通用族例外，因此字形不可能来自系统字体；预览在字体加载成功前不能播放或跳转。
- WebGL：只要求 `EXT_color_buffer_float`（半浮点过滤是 WebGL2 核心能力）。
- test-export 扩到 17 个用例（极短区间、负区间、最后一帧取消、编码器卡住、最终探测卡住、探测 N/A、探测失败、旧锁接管、活锁），每个作业有杀进程树的硬看门狗，成功用独立 ffprobe 核验；真实 SIGINT 只在 macOS / Linux 上测。

**风格解耦验收（1a–1c 完成后）。**
第二套风格包（由 `nebula` 背景扩展而来，色板、字体、版式、转场均不同），用页面场景与全幅背景场景两类代表场景验证：
不改场景代码即可切换；`just validate` 无 error；人眼确认两套风格可明显区分。

验收记录（分支 `style/second-package`，2026-10-07）：
- 切换：影片在 `film.ts` 列出可用风格（`selectStyle([paperDawn, nebula])`，第一个默认），页面 URL 的 `?style=<id>` 是唯一切换点，
  同时决定 `useStyle` 与字体包；未知 id 直接报错。`validate`、`export`、`shots` 加 `--style`；导出时核对页面实际风格。
  `regress` 只针对默认风格，基线记录风格 id，页面风格不符即报错。
- 字体按"影片 × 风格"分开打包（`films/<film>/fonts/<style>/`），启动时只加载当前风格的包，缺包报错；paper-dawn 的子集搬迁后逐字节不变。
  nebula 字体：Noto Sans SC、Inter（正 / 斜）、JetBrains Mono（google/fonts @9710da1，sha256 锁定，并与 GitHub 的 git blob 哈希核对一致），公式沿用 STIX Two。
- nebula 风格（`styles/nebula/`）：页边距 170、右栏 1010（与 paper-dawn 不同，用来检验版式解耦）；深色点阵底、星云全幅页（`light` → 亮度与密度，`sun` → 亮星）、
  光圈转场、右上等宽章节标签与顶部进度线、居中底条字幕；页面带光晕的调色。
- 验收暴露的场景耦合（都已修，在场景里改而不是迁就风格）：
  1. 四处写死的右边界 `1740` / `1770` 改为 `W - M` 起算（paper-dawn 逐像素不变）；
  2. `noise` 的比特行按固定步长从左边距排起，在 paper-dawn 下本就伸进右边距 30 px，换成 170 边距后出安全区；改为铺满 `[M, W − M]`，
     paper-dawn 的 15 个 `noise` 帧变化（人眼检查后重录基线）。
- 结果：两套风格 `validate` 均 0 error / 0 warning；regress 231/231；test-export 17/17；nebula 6 秒带音频导出成功；
  对照样张（同一时刻，页面 / 全幅 / 转场；`just shots <t> --style <id>` 可重现，不入库）待 Develata 人眼确认"明显可区分"。场景代码对风格没有任何分支。
- 未覆盖：`PlateParams` 仍是 `{time, light, sun}` 这套黎明词汇，nebula 只是重新解释；若以后风格需要更多背景参数，再讨论把它做成风格自定义。
- 工具覆盖所有风格（Develata 决定）：`just validate`、`just regress`、`just fonts` 默认跑影片的全部风格（页面 `__styles`；字体按影片导入的
  `styles/<id>`），`--style <id>` 只跑一个；回归基线每个风格一份（`films/<film>/regress/<style>.json`）。

风格解耦验收评审修正（Codex，gpt-6-astra max：1 BLOCKER / 4 SHOULD_FIX / 2 NICE_TO_HAVE，逐条核实后全部处理）：
- 页面风格身份：三个工具共用 `scripts/chrome.ts` 的 `loadFilm`：页面必须报出风格（`__style` / `__styles`），显式请求时必须一致，
  否则失败（旧构建、过期 `dist/`）；加载时抛错或 `__ready()` 抛错立即失败并带原文，不再等满超时。回归 `--update` 也走同一检查，
  基线文件按风格命名且记录风格，不可能写出无风格基线。反例已测：07e9620 的旧构建 validate / regress 均拒绝，未知风格 id 报原文。
- 字体：每个作业的字符集与覆盖脚本文件按 (影片, 风格, pid) 私有，结束删除，两个风格并发生成不会互相覆盖。
- nebula 转场：先画 alpha 遮罩再用 `source-in` 填色，任何 CSS 颜色（含 `oklch()`、`color(display-p3 …)`）都可用，不再解析序列化字符串。
- nebula 着色器：`smoothstep(1.2, -.4, d)`（edge0 > edge1，GLSL ES 3.00 未定义）改为 `1 - smoothstep(-.4, 1.2, d)`，数学等价；nebula 基线重录。
- `entropy` 的 26 列字母步长改为 `min(28, 可用宽度 / 26)`，paper-dawn 仍为 28（逐像素不变），nebula 为 27.7（原本伸进右边距 8 px）；更宽的右栏不再出安全区。
- 已有证据：nebula 基线录制后由另一轮独立 worker 乱序渲染比对 231/231，帧渲染与 seek 顺序无关。

### 阶段 A · 多影片与 agent 风格设计（2026-10-07 插入，先于阶段 2）

目标：每部新片的背景、版式与场景由 agent 按 brief 设计；人描述需求、在方向上做选择、看拼板。

划分原则（2026-10-07 与 Develata 讨论后定）：**风格是可复用的库；画面（场景）与音乐跟着内容走，留在影片里。**
- 复用的库：`engine/`（渲染内核与绘图原语）、`styles/<id>/`（风格包）、`fonts/`（字体源目录）、`audio/synth.py`（合成器与乐器）、
  `templates/`（新片骨架）。库之间、影片之间都不互相导入。
- 影片 `films/<id>/`：场景、配乐编曲、音效 cue、时间轴、按"影片 × 风格"的字体子集与回归基线。它们按场景名与小节互相引用，是一体的。
- 暂不拆：场景积木库、音乐素材库、可配置的字幕语言。等第二部片子真的复用时再抽，与"新原语进 engine 前必须有两部片子用到"同一规则。
- 信息论片保留为参考片，不迁移成新结构；它的数值与像素在本阶段保持不变（regress 证明）。

**A1 · 多影片与库的边界（一个 PR）。**
- 页面外壳通用：`index.html` 不再写死影片入口，按影片选择；产物在 `dist/<film>/`。
- 所有命令带影片参数：`just dev|build|validate|regress|fonts|shots|cues|music|export <film>`；`scripts/` 与 `justfile` 里不再写死片名，
  默认值只在 `justfile` 一处（`infotheory`）。输出路径 `out/<film>/…`。
- `audio/` 只放合成器库；配乐成品（`music.wav` 母版、`music.mp3` 预览）写到 `out/<film>/`，预览播放器从那里取；
  `films/<id>/score.py` 仍是该片的编曲。
- 字体源目录 `fonts/catalog.json`：每个字体族一条（上游 URL 固定到提交、sha256、许可证、可用字重与样式），所有风格共用；
  风格的字体声明改为引用目录 id（去掉各风格重复的 `fonts.lock.json`）。字体子集仍按"影片 × 风格"写在 `films/<id>/fonts/<style>/` 并入库，
  构建不需要联网；两部片子的子集各自独立。
- `check-imports`：影片之间不得互相导入；风格之间、库之间同样。
- `templates/film/` + `just new-film <id> --style <id>`：最小骨架（标题、一页正文、结尾三个场景，无配乐），立即可 build / validate / 无声导出；目录已存在则拒绝。
- 0d 的 macOS 运行说明随路径与命令变化更新。

退出条件：用 `new-film` 建第二部片子（约 20 秒），build、validate、无声导出通过；infotheory 两套风格 regress 逐像素不变；
`just music infotheory` 生成的母版与改动前逐字节相同；影片互相导入被 `check-imports` 拒绝；字体子集重新生成无差异。

A1 实施记录（分支 `engine/a1-films`）：
- 页面外壳 `index.html` 通用，Vite 按 `FILM`（由 `just dev|build <film>` 传入）选入口，未知片名报错并列出可选；`boot()` 接收片名与标语，开始卡片与标签页标题由片子提供。
- 工具一律要求 `--film`（`validate`、`regress`、`export`、`fonts`、`test-export`），共用的 `loadFilm` 同时核对片名与风格；`package.json` 不再有 `dev` / `build` 脚本。
- `fonts/catalog.json` 收拢两套风格的字体来源（11 条，去重后 STIX Two 只出现一次）；风格改为 `fonts.json` 引用 id。两套风格的子集重新生成后逐字节不变。
- 配乐成品移到 `out/<film>/`（`score.py` 按自身目录名决定），预览从那里取 `music.mp3`；`just music infotheory` 的母版 sha256 与改动前相同。
- `templates/film/`（标题、一页正文、结尾，20 秒，无配乐）与 `just new-film`；`check-imports` 把 `templates/` 当作片子检查，片子之间、片子到模板的导入被拒（反例已测）。
- 结果：`new-film demo nebula` → `fonts` → `validate`（0 error）→ 无声导出 600 帧 / 20.000 s，测试片不入库；infotheory `validate` 两套风格 0 error，regress 两套 231/231，
  test-export 17/17，`tsc`、`check-imports` 通过；预览（标题、字体、音乐路径）在浏览器里确认。spikes 改为读 `dist/infotheory/`，0d 运行说明随之更新。

A1 / A1b 评审修正（Codex，gpt-6-astra max：1 BLOCKER / 8 SHOULD_FIX / 2 NICE_TO_HAVE，逐条核实后全部处理）：
- `test-export` 原先无条件删除 `out/test-export/`，而 `test-export` 是合法片名：改为先校验片名与前置条件，作业目录在 `out/<film>/.test-export/`。
- 片名参数：`scripts/film-arg.ts` 统一解析（必填、FilmSpec 格式、`films/<id>/main.ts` 存在），所有工具在派生任何路径前调用；`validate --json` 的参数错误也输出诊断数组。
  反例已测：`--film ../x` 被拒，不再写出仓库外的文件。
- 帧率：`regress`、`validate` 从页面时间轴读取 fps，不再假定 30。
- `new-film`：风格须是合法单层 id 且有 `index.ts` 与 `fonts.json`；模板里风格导入与片名声明两行须各出现一次，替换在内存中完成，复制到临时目录后整体改名，失败不留半成品。
- `check-imports`：`/films/...` 这类项目根路径与 `import.meta.glob(...)`（按模式的静态目录前缀）都纳入检查，非字面量的 glob 报错；类型导入与动态导入只在代码里匹配，字符串里的文字不再误报。四个反例已测。
- 字体库：目录 id 必须唯一；风格引用不再修改目录对象；`--lock` 写回时持排他锁、重新读取目录、按 id 合并，再原子替换。两个并发作业分别补齐不同字体的反例已测，结果与原目录逐字节相同。
- 开发服务器：只提供 `/music.mp3`（支持 Range，播放器可拖动），`out/`、`dist/`、`.cache/` 与 `.env` 一律拒绝；浏览器里确认播放、跳转与 403。
- 0d 运行说明：明确须用包含 A1 的 `main`，删去旧分支的回退说法。

**A1b · 全幅背景参数与风格无关（一个小 PR）。**
- `PlateParams { time, light, sun }` 是黎明风格的词汇，场景被迫按它传参。改为语义参数：`progress`（0–1，在叙事中的位置）、
  `highlight`（0–1，背景里焦点光源的强弱，0 为无），加 `time`（秒，用于缓慢流动）。每个风格自己决定怎么画。
  （原拟的 `warmth` 目前没有场景需要，不加。）
- 信息论片四个全幅场景改传参；paper-dawn 与 nebula 内部做映射，使两套风格 regress 都逐像素不变。

**A2 · 风格设计流程（agent 主导，人做选择）。**
- 入库的设计产物：
  - `films/<id>/brief.md`：主题、受众、调性关键词、时长、必须出现的内容、参考（文字描述）、禁忌。2c 再把它收成 `Brief` schema。
  - `styles/<id>/STYLE.md`：情绪、色板及理由、字体、背景概念、版式网格、动效与转场、与已有风格的区别、明确不做的事。
  - `films/<id>/review/`：每轮拼板的生成命令与自评（按评审清单逐条）、人的意见。拼板图本身不入库，可用命令重现。
- 字体目录扩充：在 A1 的 `fonts/catalog.json` 里预选一批 OFL 字体（中文衬线、无衬线、风格化各若干，拉丁文与等宽若干），
  清单与一次性下载经 Develata 确认。agent 只从目录里选；需要新字体时提出，确认后加入目录。
  已完成（2026-10-08，Develata 确认"除霞鹜文楷外全部"）：新增 31 个文件——中文展示 6 款（站酷小薇、站酷庆科黄油体、站酷快乐体、马善政楷书、志莽行书、龙藏体，
  实测都覆盖 GB2312 全部 6763 字，标签 `gb2312`）、拉丁无衬线 4 族、衬线 5 族、等宽 3 族、展示 1 族；共 42 个文件，每条带选用标签。
  `scripts/font-catalog.ts --lock` 下载新条目，先与 GitHub 报告的 git blob id 核对再记录 sha256，并用固定版本的 fontTools 测出字重；
  记录走字体库锁（`scripts/font-lib.ts`），`fonts.ts` 只接受已登记的条目。同一字体族的静态字重（如 IBM Plex Mono 500）子集文件名带字重。
- `just new-style <id>`：从最小模板生成风格包（接口齐全、纯色背景、空的着色器模板、`STYLE.md` 骨架）。
- `just sheet <film> [--style a,b]`：拼板。每个风格取固定的代表时刻：每类场景的中段、全幅页、转场中点、带字幕的帧；
  并排输出 JPEG，另附 JSON（时刻、场景、风格、路径）。供 agent 自检和人看。
- `validate` 增加两条（对比度从 2c 提前）：文字对比度（文字颜色与其包围盒内背景采样的 WCAG 对比度 ≥ 4.5，大字 ≥ 3）；
  同一帧两个可见文字框相交即为 error。
- 两条新校验已完成（2026-10-08）：`engine/inspect.ts` 把一帧渲染两次（无文字 / 有文字），对每个完全显示的文字框，用声明的文字颜色（按透明度叠到背景上）
  对比无文字渲染里该框的平均颜色，计算 WCAG 对比度；同一帧两个完全显示（alpha ≥ 0.9）的文字框相交超过 2 px 即重叠。最初用渲染出的字形像素取文字颜色，
  抗锯齿使小字被低估（16 px 页码实测 153，实际 143），改为声明颜色。`scripts/test-validate.ts`（`just test-validate`）用模板临时建片：
  原样通过；加一个故意出错的场景后恰好报出对比度、重叠、出画面三类错误。
  检查发现 paper-dawn 有 499 处低于 AA（Develata 决定修风格，看过对照样张后确认）：页面暗角 0.22→0.12、纸边阴影减半，使渲染出的纸面最暗处从约 211 提到约 226；
  muted #8F8A80→#5F5C55、accent #C9663D→#9E421C（保持饱和度压暗）、alt2 #7C8C68→#58634A；页码不再带 0.9 透明度；
  风格接口新增 `backdrop(cx, cy, w, h, a)`（全幅背景上的文字衬底，高斯式衰减、无可见边缘），信息论片 4 个全幅场景与模板标题页调用它。
  两套风格 validate 0 error；回归基线重录（paper-dawn 全部帧、nebula 仅衬底所在帧变化），每次先看对照样张。
- 已完成（2026-10-08）：`just sheet`（代表时刻自动选取：首个全幅页、前三个页面场景、带字幕帧、淡出中点、末场景；每个风格一列，附 JSON）；
  `templates/style/` + `just new-style`（接口齐全的最小风格包与 `STYLE.md` 骨架；模板风格配模板片 validate 0 error 已测）；
  `check-imports` 把 `templates/style/` 按风格包规则检查；`AGENTS.md`（`CLAUDE.md` 只引用它）与 `.claude/skills/design-style/SKILL.md`。
  未完成：退出条件里的"新会话独立完成一部片子"需要在一个新会话（Claude 或 Codex）里实测。
- A2 评审修正（Codex，gpt-6-astra max：2 BLOCKER / 11 SHOULD_FIX / 2 NICE_TO_HAVE / 2 NEEDS_VERIFICATION，逐条核实后处理）：
  - `test-validate` 改用作业专属片名（`validate-fixture-<pid>`），只删除本次创建的目录；`sheet` 不再清空 `--out`：
    先写临时目录，只替换以前的拼板（有 `sheet.json`）或不存在的目录，其他目录拒绝。
  - 对比度测量重做（`engine/inspect.ts`）：四遍渲染——无字 / 有字（单采样，定位字形），无字 / 文字换成同色实心框（导出用的
    3 个运动模糊子帧）。文字颜色取实心框内部经过调色、合成、模糊后的实际像素，不再解析声明颜色（原正则漏匹配括号的问题随之消失）；
    文字框均分为约一字宽的格子，只计有字形的格子，取最小比值，字落在局部亮块上也能查出；渲染出错时恢复文字与记录模式。
    第一版实心框测量把框边缘的抗锯齿像素算进了文字颜色、末尾还留下 1 px 细条，已改为取框内实心像素并均分格子。
  - alpha 0.5–0.9 的文字按实际 alpha 判断并报 warning（可能是淡入中途），0.9 以上报 error，0.5 以下计入报告的未检查数；重叠同样分级。
  - 字重规范化（`bold` = 700），字号取变换后两个方向中较小的缩放。
  - 新测法发现 nebula 灰字经暗角后不足 4.5：muted #7586A0→#8D9DB6，看过前后对照后重录 nebula 基线；模板标题页、结尾页小标签提前淡入，
    使中间帧为稳定状态。`test-validate` 新增：近乎透明的 rgba 文字、局部亮块上的字、稳定半透明低对比文字（warning）。
  - 拼板：文件名带行号，时刻须有限且在片内，代表时刻按帧去重、限制在所属场景内、取所选风格的并集；`--style` 以首个所选风格加载影片。
  - 字体：锁内冲突改为抛出异常、`finally` 释放锁（已测）；`fonts.ts` 子集出错同样先清理再以 1 退出（已测）；GitHub 目录列表按目录复用、
    限流时给出重置时间、可用 `GITHUB_TOKEN`；字重测量脚本经 `-c` 传入，不留文件。
  - skill / AGENTS：交付前跑全风格 `validate` 与已有基线的 `regress`，新风格批准后只为它记录基线；动效须看连续帧或预览并说明。
    README 的对比度表述收窄为抽样检查。
  - 仍未覆盖：逐字形（非轴对齐框）检查；新会话独立验收（见上）。
- 评审清单：层级是否清楚；对比度与可读性；背景是否抢文字；颜色数量与强调色用法；字体搭配；动效是否克制统一；
  与已有风格是否明显不同；是否符合 brief 的调性。
- 流程写成项目 skill（`.claude/skills/design-style/`，AGENTS.md 引用，Codex 共用）：
  1. 读 brief，提出 2–3 个方向：文字说明，加每个方向一张用最小风格包渲染的样张。人选一个，或授权 agent 自选。
  2. 实现风格包与场景。
  3. 出拼板，按清单自评，修改；至少一轮，记录进 `review/`。
  4. 全风格 `validate` 与 `regress` 通过后，把拼板交给人；有意见回到 3。

退出条件：
- 新会话里，agent 只靠 skill 和这些命令，从一份新 brief 做出一套新风格和第二部短片（约 30 秒、4–6 个场景）；
- `validate` 0 error（含对比度、重叠）；拼板与 paper-dawn、nebula 并排，Develata 认为明显不同且符合 brief；`review/` 记录完整；
- 每条新校验至少有一个会触发它的失败用例；
- 引擎改动只限本阶段列出的契约（多影片、字体目录、背景参数、拼板、两条新校验）。

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

2a 实施记录（分支 `engine/2a-capture`，2026-10-09）：
- Develata 的决定：源视频放在仓库外，只提交清单与 sha256；Playwright 本轮一起做（用本机 Chrome 与 `playwright-core`，不下载浏览器）。
- 素材加载（`engine/media.ts`）：按需 fetch + 解码，按内存上限（768 MiB）的 LRU，淘汰时 close；场景用 `need(lt)` 声明要画的素材帧，
  渲染钩子先 `prepare(t)` 再同步绘制；导出与各检查工具为严格模式，缺帧即报错，只有预览用最近一帧顶替。
  信息论片两套风格 regress 231/231 不变。工具以 `/media/` 提供 `.cache/captures/<film>/`；顺带修了 dist 服务器可被 `%2f` 路径穿越的问题。
- 素材与剪辑（`engine/capture.ts`，单元测试 11 个）：清单、剪辑（有序的 `[from, to)` 段，各自变速，段间即剪掉）、源帧 `floor(src × fps + 1e-9)`、
  镜头关键帧（对数空间缓动缩放）、视图变换（缩放时不露出画面外）。
- 演示场景（`engine/demo.ts`）：素材帧只由输出帧时刻决定，镜头与光标随运动模糊子帧移动；光标与点击来自录制事件（剪掉的点击记为 warning）或关键帧；
  窗口、光标、点击波纹的外观由风格包的 `demo` 决定（paper-dawn、nebula、模板各一份）。
- 导入（`import-capture`）：ffmpeg fps 滤镜拆成 JPEG 序列，帧数须等于 round(时长 × fps)；`--rebuild` 按文件名找源视频、核对 sha256 后重建。
  录制（`capture`）：screencast 帧与页面事件同一时钟；录到停止时刻为止（静止页面不发帧）；注入一个 2×2 px、不透明度 0.004 的元素持续触发绘制
  （否则静止后第一帧会晚到 3 帧）；重采样成固定帧率、编码为源视频，再走同一条导入管线。
- 验收（`test-capture`，连跑两次稳定）：导入 180 帧；带剪掉与 2 倍速的剪辑经真实导出得到 90 帧，逐帧读条码均为剪辑映射的源帧；
  剪掉的点击报 1 个 warning；缺帧时渲染失败；清空缓存后可从源视频重建，源视频被改动则拒绝；Playwright 测试页的 4 次点击都在页面自己画的标记 4 px 内、
  0–2 帧内出现。
- 性能（`bench-capture`，4 worker）：导出改为每次分配 15 帧的连续块并预取该块素材。60 秒录屏演示场景 6.1 帧/秒，为章节页基准（4.8 帧/秒）的 127%；
  每个 worker 内存峰值 1104 MiB。均在 0b 的预算内（≥ 50%，≤ 2 GiB）。
- 未覆盖：macOS 上的录制与导入；演示场景在页面上的可读性（对比度检查不看素材里的文字）。
- Codex 评审（max，未通过：3 个 BLOCKER、19 个 SHOULD_FIX）后的修复，逐条核实后全部采纳：
  - `--rebuild` 先校验所有清单（id 与文件名一致、源文件名不含路径、数值合法），且所有创建、替换、删除都限定在素材目录内；
  - 导入在暂存目录完成全部校验后才提交：旧帧先移开、新帧移入、写清单，成功后才删旧帧，失败则还原；同一素材加锁；录制把新源视频写到临时名，
    导入失败时放回旧源视频；
  - 剪辑边界：场景内时刻改由整数输出帧计算（`frameOf`、`outputFrame`），段边界判定带 1e-9 容差；非零起点（f0 = 8）与 0.1 + 0.2 的单测；
  - 帧数不再按容器时长预测：接受 ffmpeg 实际输出（≥ 1 帧、编号连续，五位以上也可），与视频流时长相差不超过 1 帧；显式 `-map 0:v:0`；
  - 裁剪：清单记录 `crop`（源像素），`toFrame` 先换算到源像素再减裁剪原点；默认 viewport 为源视频尺寸；裁剪用 `exact=1`；
  - 点击：事件时间保留全精度；波纹与按压从事件所在帧开始（该帧所有子帧），之前不出现；默认时长按帧向上取整；
  - 剪辑拒绝倒序与重叠；镜头、光标、矩形参数在注册时校验；
  - 素材缓存固定当前绘制的工作集（预取不会把它淘汰，超预算报错）；预览暂停时 seek 在素材加载后补画；
  - 录制只保留主页面主 frame 的事件（iframe、弹窗的计数后丢弃），点击带目标元素与边框；帧边到边重采样并流式编码（编码落后 10 秒即失败），
    `--max-seconds` 截止；单帧静止录制可用；开始与停止时比对页面时钟与进程时钟，漂移超过 50 ms 即失败；参数用 `util.parseArgs`；
  - `/media` 与 dist 服务器按真实路径约束（`scripts/lib/confine.ts`，含 junction 单测）；
  - 演示的默认区域、波纹与按压时长移入风格包（`demo.area`、`rippleDur`、`pressDur`）；just 配方给路径加引号；
  - validate 对注册时的 notes 跨风格去重（两套风格时同一 warning 只报一次）。
- 修复后验收：`test-capture` 改为独立预期（手算的整数帧映射），两套风格、演示场景从第 7 帧开始，逐帧条码全对；裁剪素材上光标尖端落在
  手算位置 4 px 内，点击在其所在帧出现、之前无变化；失败导入不改任何东西；路径型 id 被拒绝；改动的源视频被拒绝且帧不受影响。
  regress 两套风格 231/231；validate 0 错误；test-export 17/17；单测 27 个。
- `bench-capture` 改为跟踪导出进程树下每个浏览器的进程树内存，取最大者：演示场景 5.70 帧/秒，为基准（5.62 帧/秒）的 101%；单个 worker 峰值 1218 MiB。
  有一次在后台同时安装 PyTorch 时导出报 `ERR_INSUFFICIENT_RESOURCES` 失败，单独重跑通过（推测为资源争用，未复现确认）。

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
- `just validate` 扩展：cue、字体覆盖、素材、token 引用（对比度与文字重叠已在 A2）。
- `just render-scene`、`just render-range`，输出 JSON 摘要与产物路径（拼板 `just sheet` 已在 A2）。
- 素材清单：每个非代码素材记录来源、许可证、sha256、生成模型与种子。

退出条件：每条校验规则至少有一个会触发它的失败用例；非法计划在生成场景之前就被 `plan-check` 拒绝；
agent 只用这些命令就能完成"改计划 → 生成或修改场景 → 看拼板 → 修正"的一轮。

### 阶段 3 · agent 接口与实战

- AGENTS.md（Claude 与 Codex 共用；CLAUDE.md 只指向它）：分层约定、契约、命令、如何加场景、风格规则、验收清单。
- 项目 skill：brief → film plan → 场景 → 渲染自检 → 修改（风格设计部分即 A2 的 `design-style`）。
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
| agent 设计的风格质量不稳 | 先给 2–3 个方向由人选；拼板 + 评审清单自检；对比度与重叠硬校验；字体只从确认过的目录选 |
| 着色器写坏或过慢 | 风格模板与 WebGL 编译检查（已有）；拼板实际渲染；导出速度写进拼板 JSON |

## 待确认

- 阶段 1 开始前：阶段 0 的数据与决策门结论（0a–0c 已完成，见 `spikes/RESULTS.md`）。
- 录屏一律用 viewport = 输出分辨率、DPR 1（0c 实测 DPR 2 不提高录制分辨率）。
- 0d 需要协作者在 macOS 上配合运行。
- 字体选择需人眼看样张；字体等素材文件的下载逐项确认。
- A2 字体目录的候选清单（字体族、用途、体积）需 Develata 确认后一次性下载。
