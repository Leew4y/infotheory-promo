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
- **推断**：来源 1 与 Chrome 在频繁回读时切换 2D canvas 加速状态有关；在代码里用 `getContext('2d', { willReadFrequently: true })` 应能达到同样效果。需在阶段 1a 前用 0a 复核。
- **推断**：来源 2 是 GPU 浮点运算的非确定性；没有进一步定位。
- **已核实**：CPU 2D canvas 在这台机器上反而更快（4 组共 48 秒，现状 64 秒）。
- 影响：README 中"任何进程数得到相同的视频"在像素级不成立（肉眼不可见的差异）。

### 对计划的影响

阶段 1 起 2D canvas 固定 CPU 光栅化；回归在 SwiftShader + CPU 2D 上逐像素比较；GPU 路径只用于生产。

## 0b · 录屏素材嵌入 — 未开始

## 0c · Playwright 录屏 — 未开始

## 0d · macOS 实机 — 未开始（需要协作者）
