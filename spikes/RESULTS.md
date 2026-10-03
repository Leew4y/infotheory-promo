# 阶段 0 实验结果

计划见 `docs/plan/reusable-engine.md`。每项记录机器、版本、命令与原始结果文件。

## 环境

| 项 | 值 |
|---|---|
| 机器 | Windows 11，RTX 3060 Laptop GPU |
| Chrome | 154.0.8037.93（headless，puppeteer-core） |
| GPU 后端 | ANGLE D3D11；对照组 ANGLE SwiftShader（Vulkan） |
| ffmpeg | 9.0.2（gyan.dev full build） |
| 被测源码 | 与 `421b107` 相同（`src/`、`scripts/`、`audio/`、`index.html` 无差异） |

## 0a · 基线确定性 — 完成

命令：`bun run build`，然后 `[ANGLE=swiftshader] [EXTRA_ARGS=...] bun spikes/0a-determinism/run.ts --out <file>`。
方法：经 `?export=1` 的 `__frame(t, 30)`（3 个运动模糊子帧）渲染，对 canvas 原始 RGBA（`getImageData`，不经编码）求 SHA-256。
帧集合 79 帧：首末帧、每个场景边界前后各一帧、每 5 秒一帧。每个配置跑 4 组：冷启动正序两次、乱序加重复 seek（99 次渲染）、4 个 worker 轮转。

| WebGL | 2D canvas | 结果 | 不一致 | 文件 |
|---|---|---|---|---|
| GPU（D3D11） | 硬件加速（现状） | FAIL | 6 次（帧 150、600、4950） | `0a-determinism/result.json` |
| SwiftShader | 硬件加速 | FAIL | 12 次（10 个页面场景帧，只出现在乱序与多 worker 组） | `0a-determinism/result-swiftshader.json` |
| GPU（D3D11） | CPU（`--disable-accelerated-2d-canvas`） | PASS ×3 轮，跨轮哈希也一致 | 0 | `0a-determinism/result-gpu-cpu2d{,-2,-3}.json` |
| SwiftShader | CPU | PASS | 0 | `0a-determinism/result-sw-cpu2d.json` |

单帧探测（`bun spikes/0a-determinism/probe.ts <frame> <n> [--warm <frames>]`，每个 session 是新浏览器，与参考渲染逐像素比较）：

| 配置 | 帧 150（地平线场景 `dawn`），先渲染帧 0 |
|---|---|
| GPU + 加速 2D | 6 个 session 中 5 个出现 3–4 px、最大差 1 色阶 |
| GPU + CPU 2D | 6 个 session 中 2 个出现 3 px、最大差 1 色阶 |
| SwiftShader + CPU 2D | 8 个 session 全部一致 |

### 结论

- **已核实**：现有导出路径不是逐像素确定的。之前用 JPEG 比较（24 帧两次冷启动逐字节一致）没有发现问题，因为 JPEG 掩盖了微小差异，而且那次没有测乱序和多 worker。
- **已核实**：来源 1 是硬件加速 2D canvas，结果依赖渲染历史（乱序、多 worker 时出现），两种 WebGL 后端下都有；关闭 2D canvas 加速后，79 帧 × 4 组 × 3 轮完全一致。
- **已核实**：来源 2 是 GPU（D3D11）上的 WebGL 地平线着色器，偶发 ≤ 6 px、差 1 色阶，与顺序无关；SwiftShader 下未观察到。
- **推断**：来源 1 与 Chrome 在频繁回读时切换 2D canvas 加速状态有关。
- **已核实（1a）**：在代码里用 `getContext('2d', { willReadFrequently: true })`（主 canvas 与纸纹 canvas 都加）**不能**替代启动参数：
  不带参数的回归与基线有 199–214 帧不同，0a 在 GPU 与 SwiftShader 下仍有顺序相关的不一致。因此保留启动参数 `--disable-accelerated-2d-canvas`。
- **推断**：来源 2 是 GPU 浮点运算的非确定性；没有进一步定位。
- **已核实**：CPU 2D canvas 在这台机器上反而更快（4 组共 48 秒，现状 64 秒）。
- 影响：README 中"任何进程数得到相同的视频"在像素级不成立（肉眼不可见的差异）。

### 对计划的影响

阶段 1 起 2D canvas 固定 CPU 光栅化；回归在 SwiftShader + CPU 2D 上逐像素比较；GPU 路径只用于生产。

## 0b · 录屏素材嵌入 — 完成，全部通过

素材：`bun spikes/0b-media/make-source.ts out/0b-media` 生成 90 秒 1080p30 H.264 诊断视频（testsrc2 背景、16 位帧号条码、灰阶、色块、14 px 文字），
拆成 JPEG 序列（2700 帧，`-q:v 2`，314 MB）与前 30 秒的 PNG 序列（900 帧，184 MB）。
页面：`spikes/0b-media/page.ts` 直接使用未修改的 `src/engine`，加一种"录屏"场景：按输出帧号按需 `fetch` + `createImageBitmap`，LRU 缓存 32 帧，预取 8 帧。
所有运行均使用 CPU 2D canvas（依据 0a）。

### 正确性（`bun spikes/0b-media/run.ts check --fmt jpg|png`）

| 检查 | JPEG（2700 帧） | PNG（900 帧） |
|---|---|---|
| 1 无模糊：条码 == 输出帧号（顺序全片、随机 300、逆序 300、边界帧） | PASS | PASS |
| 2 模糊 + 镜头移动：每个子帧记录的源帧 == 由输出帧号独立算出的期望值 | PASS（392 帧 × 3 子帧） | PASS（132 帧 × 3 子帧） |
| 3 模糊 + 静止镜头：累积色块 == 各子帧色阶均值 | PASS，最大误差 0.333 色阶 | PASS，最大误差 0.333 |
| 4 编码链路：H.264 成片解码后条码序列 == 0..N−1，帧数 == N | PASS（导出时检查，见下表） | PASS |

PNG 只有 30 秒，未覆盖 45 秒处的场景边界；JPEG 覆盖了。

过程中发现（**已核实**）：现有引擎在任何 `fi > 0` 时，场景第一帧（`lt = 0`）完全被淡入色覆盖；`fi = 0` 能关闭淡入，但依赖 `0/0 = NaN` 使 `fade > 0` 为假。
阶段 1 应把"无淡入"写成显式分支。

### 性能（`bun spikes/0b-media/run.ts export ...`，每个配置冷、热各一遍）

统计口径：墙钟时间从启动浏览器（冷）或开始渲染（热）到 ffmpeg 退出；内存为每个 worker 的 Chrome 进程树工作集峰值（每秒采样，不含显存）。
"冷"指新启动的浏览器，没有清空操作系统文件缓存。

| 配置 | worker | 冷：秒 / 帧每秒 | 热：秒 / 帧每秒 | 内存峰值 MiB / worker | 首帧（冷，含启动） |
|---|---|---|---|---|---|
| 基准：现有片 `surprise`（18 秒，540 帧） | 1 | 115.8 / 4.7 | 129.0 / 4.2 | 664–821 | 1.7 s |
| 基准：现有片 `surprise` | 4 | 56.2 / 9.6 | 50.9 / 10.6 | 606–651 | 3.4 s |
| 诊断录屏 JPEG（90 秒，2700 帧） | 1 | 339.6 / 8.0 | 352.4 / 7.7 | 847–1098 | 1.9 s |
| 诊断录屏 JPEG | 4 | **103.7 / 26.1** | 98.8 / 27.3 | 923–1080 | 2.5 s |
| 诊断录屏 PNG（30 秒，900 帧） | 4 | 36.6 / 24.6 | 34.8 / 25.9 | 878–938 | 2.6 s |

对照预算：

| 预算 | 结果 |
|---|---|
| 4 worker 冷缓存导出 90 秒录屏诊断片 ≤ 10 分钟 | 1.7 分钟，PASS |
| 录屏场景吞吐 ≥ 基准场景的 50% | 26.1 / 9.6 ≈ 270%，PASS |
| 每个 worker 内存峰值 ≤ 2 GiB | ≤ 1098 MiB，PASS |
| 冷启动到首帧 ≤ 10 秒 | ≤ 2.6 秒，PASS |

**推断**：现有片的页面场景比录屏场景慢，是因为纸纹图案、文字和矢量绘制在 CPU 2D canvas 上开销较大；录屏场景基本只有一次 `drawImage`。
PNG 与 JPEG 序列的吞吐接近，JPEG 体积小一半以上，建议默认 JPEG。

## 0c · Playwright 录屏 — 完成，按修订后的标准通过（2026-10-03 确认修订）

命令：`cd spikes/0c-capture && bun install && bun run.ts`。Playwright 1.63.0（`playwright-core`，使用本机 Chrome）。
测试页 `spikes/0c-capture/page.html`：持续 CSS 动画、滚动列表、按钮网格；每次 `pointerdown` 时更新画面内的点击条码，并以 `performance.timeOrigin + event.timeStamp` 记录事件。
16 秒录制，16 次点击，5 次滚动。结果文件 `0c-capture/capture-result.json`。

| 指标 | viewport 1920×1080，DPR 1 | viewport 1280×720，DPR 2 | 标准 |
|---|---|---|---|
| 实际 JPEG 尺寸（请求 1920×1080） | 1920×1080 | **1280×720** | 等于请求尺寸 |
| 有效帧率 | 99 fps | 99 fps | — |
| 帧间隔 中位数 / p95 / 最大 | 11.6 / 13.1 / 21.3 ms | 11.8 / 14.5 / 19.8 ms | ≤ 34 / 50 / 100 ms，PASS |
| 14 px 文字（quality 90） | 清晰可读（人眼看过 `out/0c-capture/sample-vp1920-dpr1.jpg`） | — | PASS |
| 条码不可读的帧 | 0 / 1616 | 0 / 1616 | — |
| 事件 → 首个显示该点击的输出帧，偏差 | 1–2 帧 | 1–2 帧 | 修订后 [0, 2] 帧，PASS（原标准 ≤ 1 帧为 FAIL） |
| 事件 → 该帧呈现的时延 | 19–54 ms | 16–53 ms | 修订后 ≤ 66 ms，PASS |

分析：
- **已核实**：DPR 2 不会提高录制分辨率。`screencast` 输出的是 CSS 像素尺寸（1280×720），不是设备像素（2560×1440）。要录 1080p，viewport 就设成 1920×1080、DPR 1。
- **已核实**：偏差总是 1 或 2，从未出现 0 或负值，时延 16–54 ms，大约是 1–3 个 60 Hz 绘制周期。
- **推断**：原标准"≤ 1 帧"本身定得不对。事件到画面变化有真实的输入→绘制时延；按 30fps 重采样后，再加上最多 1 帧的量化误差。只要时延不为 0，事件落在一个输出帧区间末尾时偏差就是 2。所以偏差 2 并不表示时钟没对齐。
- 标准已修订为两条：时延（帧呈现时刻 − 事件时刻）≤ 66 ms；偏差在 [0, 2] 帧之内。按修订后的标准，0c 通过。
- 对 BrowserDemo 的含义：合成光标的点击效果放在事件时刻，界面反应在 1–2 帧后出现，和真实操作的观感一致。

## 0d · macOS 实机 — 待协作者运行

说明见 `spikes/0d-macos/README.md`。Windows 对照结果在 `spikes/0d-macos/windows-reference/`（GPU 能力全部具备，三张样张正常）。

## 决策门

- 0a：现状 FAIL；改用 CPU 2D canvas 后 PASS（GPU 地平线帧的 ±1 偶发差异，按计划只影响生产路径）。
- 0b：全部 PASS，余量大。
- 0c：PASS（事件对齐按修订后的标准）。
- 0d：待运行。

建议：保留现有渲染器，0d 结果回来后开始阶段 1。
