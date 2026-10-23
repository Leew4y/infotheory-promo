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
| `just test-capture` | 4 次运行都 FAIL，失败项不固定，都在阈值边上：点击在页面上晚 3 帧（允许 0–2），或 paper-dawn 下第一次点击的波纹中心离页面标记 3.3 px（允许 3）。原因与修正见下文"后续" | 通过 |
| `just test-export infotheory` | 16/18（跑了两次，结果相同）。两个失败都不是导出器的问题：真实 SIGINT 用例在第 12 秒发信号，这台机器 10.7 秒已导完 600 帧（exit 0）；"最终探测卡住"用例按时以 exit 1 失败，但残留进程检查把 Chrome 拉起的 GoogleUpdater 算作遗留进程。修正见"后续" | 17/17 |
| `just dev infotheory`（预览） | 开始卡片、字体、播放、跳转正常，控制台无错误 | — |
| `just regress` | 按设计拒绝：基线在 win32 x64 上录制（之后按平台录了 darwin-arm64 基线，见"后续"） | — |
| 本地 TTS（CosyVoice3） | 未安装、未测 | 已验证 |

## 观察

- 样张与 `windows-reference/` 有差异，来源是参考图本身：参考图最后一次提交是 2026-10-03（64bcf17），早于 1c 的字体替换、
  A2 的对比度修正（2026-10-08：暗角、muted 色变深）和显示标点（2026-10-13，84be186：行尾不再有句号）。
  README 里"画面应与 windows-reference 一致"已无法照做。
- 0c 与 test-capture 里"点击晚 3 帧"的失败（推断同一来源）：macOS 上 headless Chrome 的 screencast 是 60 fps，比 Windows 的
  99 fps 多约一个绘制周期的时延。对成片的影响是界面反应比合成点击波纹再晚约 1 帧（33 ms）。
- test-capture 里 paper-dawn 第一次点击的 3.3 px 偏差当时没有解释（原因见"后续"：测量方法的偏差，不是映射错误）：同一数值（波纹 (496.0, 279.2)，标记 (498.0, 281.8)）在三次
  重新录制中完全相同，nebula 下同一点击的偏差符号相反且在 3 px 以内。
- Apple Metal 上地平线着色器在探测中逐像素确定，Windows D3D11 上不是；未做更大样本。

## 后续（2026-10-23，`mac-workflow` 分支）

上面的结果之后，按平台录了 darwin-arm64 的回归基线（4708b5d，Chrome 155.0.8059.85），并修正了这次运行暴露的问题。
本节的计时都在同一台机器上测，旁边有别的任务在跑；括号里是 `uptime` 的 1 分钟负载。

### 固定浏览器

工具原来用本机装的 Chrome：自动更新会悄悄改变像素，两位协作者的版本不同（Windows 基线用 155.0.8059.40 录，macOS 用
155.0.8059.85），macOS 上的品牌版 Chrome 还会拉起 GoogleUpdater。现在 `just browser`（`just setup` 也会运行）把固定版本的
Chrome for Testing 下载到 `.cache/chrome/`，按 sha256 校验，`scripts/chrome.ts` 的 `findChrome` 依次用 `$CHROME_PATH`、
固定版本、本机 Chrome（带一行警告）。

- 版本 155.0.8059.85，与 darwin-arm64 基线录制时的品牌版同一版本。它不在 Chrome for Testing 的 JSON 版本列表里
  （2026-10-22 的 `known-good-versions-with-downloads.json`，155 的最后一个是 155.0.8059.84），但四个平台的压缩包都在官方存储
  `storage.googleapis.com/chrome-for-testing-public` 上。sha256 是下载后算的，各文件的 md5 与存储返回的 `x-goog-hash` 一致：

  | 平台 | 压缩包 | 字节 | sha256 |
  |---|---|---|---|
  | darwin-arm64 | `mac-arm64/chrome-mac-arm64.zip` | 192677818 | `b076e45ba9c98f9fb20a5bae06fd3d6954db012f4b51cc965c945e5bb9405afa` |
  | darwin-x64 | `mac-x64/chrome-mac-x64.zip` | 203154428 | `f51dc6be5909ac0a79b7fdb5752de3ae8abea1ce0da019c60a37a6beb3c92c89` |
  | win32-x64 | `win64/chrome-win64.zip` | 206113632 | `a6c6c6aaf97fc698806bf255ced0ead040f02222e43d0519da1a811e8d639e54` |
  | linux-x64 | `linux64/chrome-linux64.zip` | 199006420 | `8e59438837ac4b995d01ef4026bac85c95800376bb2e3c06ac4d54af1ebd5f9d` |

- 用固定版本：`just regress infotheory`（两套风格各 231 帧）和 `just regress math-lessons`（360 帧）逐像素 PASS，基线不用重录。
- 只在 macOS arm64 上运行过。Windows 的下载与解压（系统自带的 `tar.exe`）按文档写成，没有在 Windows 上跑过；win32-x64 基线是
  155.0.8059.40 录的，固定版本下是否逐像素一致要在 Windows 上核对，不一致时按 `scripts/regress.ts` 开头的步骤从已知正确的提交重录。
- 更新器：品牌版的 `Google Chrome Framework.framework/.../Helpers/` 里有 `GoogleUpdater.app`，Chrome for Testing 的包里没有
  任何 updater。本机的 GoogleUpdater 日志显示它当天运行了多次（`--wake`、`--server`、`--crash-handler`）；在一次 8 秒的启动
  测试里品牌版没有当场拉起它，所以"由导出里的 Chrome 拉起"依据的是上面 test-export 的报错原文，没有重现。

### test-export

- 真实 SIGINT 用例原来在墙钟第 12 秒发信号，这台机器 10.7 秒就导完了 600 帧。现在等导出报告写出 150 帧再发
  （`EXPORT_PROGRESS_EVERY=10` 让导出每 10 帧报一次进度），并要求发信号后 15 秒内退出，与机器快慢无关。
- 残留进程检查不加忽略名单：根本原因是品牌版 Chrome 的更新器，固定版本没有它。test-export 在没用固定版本时先打印一行说明，
  报残留进程时列出前三个命令行。
- 结果：18/18 通过（3.4–6.9）；SIGINT 在第 150 帧发出，0.2 秒后以 130 退出；"最终探测卡住"用例没有残留进程。

### test-capture："页面晚 3 帧才显示点击"

0c 的 spike 增加了时延分解（`spikes/0c-capture/run.ts`）：事件 → 处理函数 → 绘制这个变化的帧开始（`requestAnimationFrame` 的时间）
→ 第一个显示它的 screencast 帧的时间戳。固定版本和品牌版各跑 3 次，每次两组配置各 15 次点击，共 180 次
（`latency/*.json`，负载在 `latency/loads.tsv`，1 分钟负载 3.5–5.3）。

| 量 | 结果 |
|---|---|
| 固定版本与品牌版 | 没有差别（同一版本） |
| screencast 帧间隔中位数 | 16.7 ms（60 Hz；Windows 99 Hz） |
| 事件 → 处理函数 | ≤ 1 ms |
| 帧开始 → 时间戳 | 3–12、19–23 或 36–39 ms（47、89、44 次），即 0、1 或 2 个 16.7 ms 间隔再加几毫秒；同一次运行里也会变 |
| 事件 → 时间戳（原始时延） | 4–54 ms；一次 66 ms（`branded-1`，那次运行有 226 ms 的 screencast 停顿，处理函数之后等了 46 ms 才开始下一帧）。54 与 66 都是该次录制的第一次点击 |
| 0c 原来的"时延"（经 30 fps 重采样后那一帧的时间戳） | 4–85 ms，偏差 1–3 帧；重采样最多多算一个输出帧 |

- 原因：test-capture 的检查"事件所在帧之后 0–2 帧内显示"并不等于 0c 的时延标准（≤ 66 ms）。偏差 = 首个显示帧 − 事件所在帧；
  事件在它那一帧里越靠后，同样的时延算出的偏差越大：偏差 ≤ 2 相当于要求时延 < (2 − 事件在帧内的位置) × 33.3 ms，
  介于 33 与 67 ms 之间。macOS 上帧开始到时间戳常是两个 60 Hz 间隔，时延多在 20–54 ms，于是约一半的点击算出 3 帧；
  Windows 是 99 Hz，时延短，很少碰到（推断：Windows 上 test-capture 一直通过，没有做同样的分解）。
- 修正（`scripts/test-capture.ts`）：直接检查时延。30 fps 的帧只能把时延限定在一个 1/30 秒的区间里（首个显示帧的前一帧到这一帧），
  整个区间都晚于上限才算失败；早于事件所在帧仍算失败。上限：其他平台沿用 0c 的 66 ms；macOS 83 ms，即多一个 60 Hz 间隔：
  它的帧间隔是 16.7 ms 而不是约 10 ms，时延最多由三个间隔组成（等下一帧开始，再加流水线里的两个）。
- 为什么是门限而不是在 `scripts/capture.ts` 里补偿时延：时延在一次录制里就会相差 0–2 个间隔，常数补偿只能平移、不能缩小这个范围，
  还会把一部分点击的波纹挪到页面反应之后；Windows 的时延不同，补偿要按平台定；0c 定下的观感是波纹在事件时刻出现、界面随后反应，
  与真实操作一致。
- 结果：修正后连续 7 次通过（4.8、5.6、7.0、37、19、7.0、7.9），28 次点击的时延区间下界 1–37 ms、上界 35–70 ms。

### test-capture：paper-dawn 第一次点击的波纹偏 3.3 px

- 不是映射错误。用 `engine/capture.ts` 的纯函数（`toFrame`、`viewTransform`、`cameraAt`）按三个运动模糊子帧算出点击 0
  在画面上的位置：paper-dawn (497.55, 281.19)，nebula (496.15, 280.46)；页面自己画的红色标记在 (498.0, 281.8)、(496.0, 280.2)。
- 偏差来自测量：测试取 web 与 webbare 两帧差值大于 60 的像素的质心。点击 0 落在镜头推近的过程中（0–2 秒），三个子帧里波纹的
  圆心和半径都略有不同，朝镜头移动方向一侧的圆环被拉宽，过阈值的像素更多（以计算出的圆心为准，左上象限 169 个、右下象限 120 个），
  质心偏了 (−1.6, −2.0)。nebula 下另有一个离波纹 613 px 的编码噪点，一个像素就把全画面的质心移了约 1.5 px。点击时刻每次录制都一样，
  所以三次重录数值相同；其余三次点击在推近结束之后，偏差都在 1 px 内。
- 修正：圆心改用最小二乘拟合的圆（只用离差值像素中位数 80 px 以内的点）。同一帧上拟合结果 paper-dawn (497.59, 281.07)、
  nebula (496.02, 280.52)，与计算值相差 0.13、0.14 px。修正后 7 次运行里所有点击与页面标记相差 ≤ 0.9 px，门限仍是 3 px。

