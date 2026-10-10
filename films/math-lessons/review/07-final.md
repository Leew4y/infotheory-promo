# 07 · 终稿（v3）验收记录

## 成片

- `out/math-lessons/math-lessons.mp4`：H.264 1920×1080、30 fps、8,985 帧；AAC 音轨；时长 299.500 s；1,373.9 MB（crf 18）。
- 命令：`just all math-lessons`（cues → music → export）。前三次导出失败，原因与片子无关：
  1. 第一次被我自己的输出过滤掩盖了错误信息；
  2. 第二次 "Waiting failed: 60000ms exceeded"、第三次 "Runtime.callFunctionOn timed out"——同一时间另一个会话在主工作树上跑 `test-export` / `validate` / `regress --film infotheory`
     （regress 用 SwiftShader 软件渲染，占满 CPU），我的导出被饿死。没有动对方的进程；等其空闲一分钟后，用 2 个 worker 重导成功。
- 速度：本次 **6.1 帧/秒**（2 个 worker，24.8 分钟）；无竞争时的 v0 导出为 10.7 帧/秒（4 个 worker）。
- 从 mp4 本身抽帧核对（44、59.5、85、160 s）：画面为 v3 文本（"有些看似无用的研究"、"Hardy 也写道"、"评估中向模型提出了约 4000 个问题"、Córdoba 一栏）。
- 配乐：母带 −16.00 LUFS，true peak −2.90 dBTP，47 个音效。

## 完成标准逐条

| 标准 | 结果 |
|---|---|
| `just check` | 通过 |
| `just check-imports` | PASS，65 个文件，0 错误 |
| `just validate math-lessons` | PASS：48 场次（16 场 × 3 个风格）× 5 帧，1,773 个文字框，**0 错误**，3 个警告。vigil 无警告；3 个警告都在保留作对比的 B、C 方向，均为淡入中途（alpha 0.68–0.77）的对比度：B 的序数 9（4.43:1）、C 的序数 9（3.78:1）、C 的启应答句（2.12:1，大字），淡入结束后都达标 |
| `just regress` | 参考片 `infotheory`：paper-dawn 231/231、nebula 231/231（第四阶段运行；此后没有改 engine/ 与已有风格，`git diff b663e5b -- engine styles/paper-dawn styles/nebula films/infotheory` 为空）。本片三个风格**尚无基线**：按 skill，等 Develata 认可 vigil 的外观后再录 |
| 拼图与 paper-dawn、nebula 并排明显不同且符合 brief | review/05-compare-sheet.jpg（7 个时刻 × 3 个风格）。我看过：暖黑、烛金、衬线展示体、玫瑰窗，与米纸地平线、蓝色星云明显不同 |
| review/ 记录完整 | 01 方向、02 自评（含配乐与性能）、03 冻结前两轮自查、04 盲审与逐条核实、05 并排拼图、06 复核审计、07 本文件、workflow-notes |
| 用 `just all` 导出带配乐的成片 | 完成（见上） |

## 审计闭环

- v1 独立盲审：不通过（1 阻断、10 应修）；逐条核实后 R1–R14 修订（revisions.md）。
- v2 复核审计：通过、无阻断；R15–R21 修订。复核审计提出的"需核实"项（标签、记号是否真的显示）由渲染帧核对：显示正常。
- 片尾按 Develata 决定只写"本片由 Develata 主制"，不写工具与审计。

## 未验证 / 推断

- 未验证：配乐的主观听感（没有人听过）；配音不存在，4 字/秒的语速是假设；动效只看了一处交界的连续帧与若干单帧；
  Navier–Stokes 证明与其 Lean 形式化的正确性（本片明说不判断）；Fontenelle 1702 年初印本、Hardy 1940 年初版扫描、Huygens 原图。
- 推断：导出前三次失败的原因是与另一个会话的渲染竞争（时间与进程吻合，空闲后即成功），未做受控复现。
