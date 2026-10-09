# 流程记录（边做边记，收尾时整理）

用途：如实记录 AGENTS.md、design-style skill、just 命令在实际使用中哪里不清楚、缺了什么、哪一步出过错，以及绕过办法。

## 第 0–1 阶段（2026-10-09）

1. **`just new-film` 与"先写研究再起片"冲突。** 任务要求第一阶段就把研究文件写进 `films/math-lessons/research/`，
   但 `scripts/new-film.ts` 在 `films/<id>/` 已存在时直接退出（"already exists"）。计划的绕过办法：实现阶段先把
   `films/math-lessons/` 暂时改名，运行 `just new-film`，再把 `research/`、`review/`、`script/`、`brief.md` 移回。
   改进建议：new-film 允许目标目录已存在但只含非代码文件（research/、review/、brief.md），或提供 `--into-existing`。
2. **AGENTS.md / skill 没有说研究资料放在哪里。** 影片目录结构只列了代码与资源（film.ts、scenes/、score.py、fonts/、regress/）；
   brief.md 在 skill 里出现，research/、script/、review/ 的约定来自本次任务书，不在仓库说明里。
3. **来源获取：** Gallica（BnF）有人机验证，curl 与内置浏览器都打不开，只能改用 archive.org 的 1742 年《全集》扫描；
   openai.com 对 curl 返回 403，需用内置浏览器读取；GitHub API 间歇性连接失败（重试可恢复）；Google Books API 当日配额为 0。
   这些与仓库无关，但说明"逐字核对一手来源"在本环境下需要预留时间，并且要记录实际用的版本。
