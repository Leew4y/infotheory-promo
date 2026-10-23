# 0d · macOS 实机结果（2026-10-23）

按 `README.md` 的步骤在 `main`（28506f1）上运行。原始结果文件都在本目录。
没有运行的步骤：0b（录屏素材嵌入的三条命令）和第 6 步的 `macdemo`（new-film → fonts → validate → 无声导出）；
`just test-plan` 与 `just test-capture` 覆盖了相近的路径，但不是同一组命令。

## 环境

| 项 | 值 |
|---|---|
| 机器 | Apple M5 Pro（6 性能核 + 12 能效核），48 GB 内存 |
| 系统 | macOS 26.5.1 |
| Chrome | 155.0.8059.85（headless，puppeteer-core / playwright-core 1.63.0） |
| GPU 后端 | ANGLE Metal（浏览器默认）；回归用 SwiftShader |
| ffmpeg | 9.0.2（Homebrew） |
| bun / uv / just | 1.4.4 / 0.13.1 / 1.59.0（均为 Homebrew） |

## 结果

| 项 | macOS | Windows 参考 |
|---|---|---|
| `just check`、`just check-imports`、`just test`（46 个单测） | 通过 | 通过 |
| GPU 检查（`gpu-check.json`） | 通过：WebGL2、`EXT_color_buffer_float`、半浮点 framebuffer、着色器编译与链接都具备 | 通过 |
| 三张样张（`mac-frames/`，PNG 转为 JPEG q2 入库） | 字体、颜色、地平线着色器正常，无黑块、错色、缺字 | — |
| 0a 现状参数（`0a-default.json`） | FAIL：3 处不一致（帧 600、4950，只在乱序与多 worker 组） | FAIL |
| 0a CPU 2D canvas（`0a-cpu2d.json`） | PASS：79 帧 × 4 组 | PASS |
| 单帧探测，帧 150（地平线），GPU + CPU 2D | 6 个 session 全部逐像素一致 | 6 个中 2 个差 1 色阶 |
| 0c 录屏（`capture-result.json`） | 帧间隔中位数 16.7 ms（60 fps），最大 19.9 ms；尺寸与 Windows 相同；14 px 文字清晰（`sample-*.jpg`）；**点击偏差 2–3 帧、时延 37–68 ms，略超修订后的标准（[0, 2] 帧、≤ 66 ms）** | 99 fps；偏差 1–2 帧，时延 16–54 ms |
| `just validate infotheory`（两套风格） | 0 error，6 warning（与 Windows 记录相同） | 同 |
| `just validate math-lessons` | 0 error，1 warning | — |
| `just validate raa-demo` | FAIL，18 error：录屏帧缺失（源视频 `site.mp4` 不在仓库，`.cache/captures/` 为空） | — |
| `just music infotheory` | 202.000 s，−16.00 LUFS，真峰值 −7.20 dBTP（与 Windows 记录相同） | 同 |
| 6 秒导出（30–36 s，终版 3 子帧，4 worker） | 8 秒，55 帧/秒；BT.709、limited range 标记正确 | — |
| 整片导出（6060 帧，带音频，4 worker） | 2.0 分钟（约 50 帧/秒），1162 MB | 约 9.3 帧/秒（计划记录） |
| `just test-validate`、`just test-plan`、`just test-narration`（fake 音色） | 全部通过 | 通过 |
| `just test-capture` | 4 次运行都 FAIL，失败项不固定，都在阈值边上：点击在页面上晚 3 帧（允许 0–2），或 paper-dawn 下第一次点击的波纹中心离页面标记 3.3 px（允许 3） | 通过 |
| `just test-export infotheory` | 16/18（跑了两次，结果相同）。两个失败都不是导出器的问题：真实 SIGINT 用例在第 12 秒发信号，这台机器 10.7 秒已导完 600 帧（exit 0）；"最终探测卡住"用例按时以 exit 1 失败，但残留进程检查把 Chrome 拉起的 GoogleUpdater 算作遗留进程 | 17/17 |
| `just dev infotheory`（预览） | 开始卡片、字体、播放、跳转正常，控制台无错误 | — |
| `just regress` | 按设计拒绝：基线在 win32 x64 上录制 | — |
| 本地 TTS（CosyVoice3） | 未安装、未测 | 已验证 |

## 观察

- 样张与 `windows-reference/` 有差异，来源是参考图本身：参考图最后一次提交是 2026-10-03（64bcf17），早于 1c 的字体替换、
  A2 的对比度修正（2026-10-08：暗角、muted 色变深）和显示标点（2026-10-13，84be186：行尾不再有句号）。
  README 里"画面应与 windows-reference 一致"已无法照做。
- 0c 与 test-capture 里"点击晚 3 帧"的失败（推断同一来源）：macOS 上 headless Chrome 的 screencast 是 60 fps，比 Windows 的
  99 fps 多约一个绘制周期的时延。对成片的影响是界面反应比合成点击波纹再晚约 1 帧（33 ms）。
- test-capture 里 paper-dawn 第一次点击的 3.3 px 偏差没有解释：同一数值（波纹 (496.0, 279.2)，标记 (498.0, 281.8)）在三次
  重新录制中完全相同，nebula 下同一点击的偏差符号相反且在 3 px 以内。
- Apple Metal 上地平线着色器在探测中逐像素确定，Windows D3D11 上不是；未做更大样本。
