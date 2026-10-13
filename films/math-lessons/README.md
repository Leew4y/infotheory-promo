# math-lessons · 制作包

《对数学，人类应从历史中得到教训》——当机器开始解题，我们是否再次误解了数学？　片中不署名。
片长 4 分 59.3 秒（30 fps，8,980 帧；v4，2026-10-13），中文旁白（音色 zh-male-professor）与中文字幕，带配乐，风格 `styles/vigil`（夜祷；未选的两个方向在 ../../backup/）。

| 内容 | 文件 |
|---|---|
| 任务书、随笔（输入） | ../../briefs/math-lessons/task.md、essay.md |
| brief | brief.md |
| 旁白（配音稿，终稿） | script/narration.v4.md（面向 X / 抖音的大众版，经 Codex 审计；v1–v3 保留作历史）；配音 narration.json、narration/、narration.lock.json |
| 分镜与镜头时长 | script/storyboard.v3.md（v0、v1、v2 保留作历史） |
| 字幕与画面文字（由场景文件导出） | script/captions.v3.md |
| 声音设计与配乐方案 | script/sound.md；配乐源码 score.py |
| 视觉素材要求 | script/visuals.md |
| 素材来源（逐字原文、位置、核查状态） | research/sources.md（终稿快照 sources.v3.md） |
| 事实核验表 | research/facts.md（终稿快照 facts.v3.md） |
| 论证地图 | research/argument-map.md |
| 逻辑审计报告 | review/03-freeze-v1.md（冻结前两轮自查）；review/04-audit-v1-report.md（独立盲审原文）与 04-audit-v1-verification.md（逐条核实）；review/06-audit-v2-report.md（复核审计原文） |
| 修订记录 | research/revisions.md（R1–R27：初稿原句、证据、改句；R22–R27 为 v4 审计） |
| 风格选择与自评 | review/01-directions.md（三个方向）、02-vigil.md（自评、配乐与性能）、05-compare-sheet.jpg（与 paper-dawn、nebula 并排） |
| 流程记录 | review/workflow-notes.md |
| 终稿验收 | review/07-final.md；验收后的修改（字形错误、B/C 移到 backup/、片尾不署名、基线）：review/08-post-acceptance.md；面向 X / 抖音的评审与 v4 改版：review/09-social-review.md |
| 成片 | out/math-lessons/math-lessons.mp4（不入库；由 `just all math-lessons` 生成） |

命令：`just fonts math-lessons`、`just validate math-lessons`、`just sheet math-lessons`、`just all math-lessons`。
