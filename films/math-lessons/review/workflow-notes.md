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

## 第三阶段（2026-10-09）

4. **`just new-film` 的绕过办法已实际使用**：`mv films/math-lessons films/_ml && just new-film math-lessons paper-dawn && mv films/_ml/* films/math-lessons/`。成功；模板的三场（title、idea、end）随后删除。
5. **只要中文字幕时，没有现成的约定。** `Sub` 与 `statement()` / `chapterLabel()` 都假设中英双语；做法是让本片的风格只画中文，并把 `Sub` 的第四栏挪作"经文记号"。
   这是本片的约定（写在 film.ts 注释里），不是引擎的；改进建议：在 `Sub` 上加一个可选的标注栏，或让风格声明"单语"。
6. **片长要先算再写。** skill 与 AGENTS.md 没有提语速与时长的关系；第一稿配音稿按 3.2 字/秒要 9 分半。用一个一次性脚本按语速推算每段字幕的时长并核对字幕与配音稿一字不差，
   才把片子压到 5 分钟以内。改进建议：skill 第 0 步的 brief 加一行"旁白字数与语速"。
7. **序数离页边太近会被安全区检查拦下**：C 方向页边距 150 px，序数画在左侧 48 px 处，越过 5% 线（96 px）；validate 准确报出，改为最多偏移 44 px。

## 实现与第四、五阶段（2026-10-09）

8. **一次提交单独不能构建。** 把方向 A 改名为 `styles/vigil` 时，`git add` 里多写了一个已不存在的路径，整条命令失败，随后的 `git commit` 只提交了 `git mv` 已暂存的改名（b9e10f6），
   没有带上 film.ts 与 style id 的改动；下一次提交（8a300c1）补齐。教训：改名后先 `just check` 再提交，`git add` 失败时不要接着提交。
9. **"字幕＝画面文字"时不要重复。** 第一轮自评发现复沓句同时以大字和字幕出现两次。约定：画面已逐字出现的句子不出字幕（各场景注释写明）。
   validate 不检查这种重复；建议 skill 第 3 步的清单加一条"同一句不要同时作为大字和字幕"。
10. **validate 查不到的问题。** 玫瑰窗在后段过亮、抢字（清单第 3 条）只能靠看拼图发现；validate 的对比度是对文字背后的像素算的，窗的亮块不在文字正后方时不会报。
11. **风格方向保留在片子里的代价。** 按 Develata 要求 B、C 两个方向继续列在 selectStyle 里，每次改文字都要三个风格同时过 validate（B、C 的标签会把文字转大写，
    "Córdoba" 变成 "CÓRDOBA"，大写的 Ó 不在字体子集里，validate 报缺字）。解决办法是仓库已有的 `films/<film>/fonts.extra.txt`；这条机制在 AGENTS.md 里没有提到，只在 scripts/fonts.ts 的注释里。
12. **与 paper-dawn、nebula 并排的拼图需要临时改 film.ts。** skill 第 3 步写了 `just sheet <film> --style <id>,<an existing style>`，但一个风格要先列进片子的 selectStyle 并生成字体子集才能出现在拼图里；
    做法：临时加进 film.ts → `just fonts --style` → `just sheet --out out/<film>/sheet-compare` → 还原 film.ts、删掉临时字体目录。另外，旧风格会把字幕的第二栏当英文画出来（本片放的是经文记号），拼图里会看到多出的数字——只影响对比，不影响本片。
    建议：`just sheet` 增加 `--with-style <id>`，不改 film.ts。
13. **审计包的组织。** 盲审只给冻结的制作包与检索到的来源原文（含扫描图像），不给论证地图与评审记录；字幕与画面文字由场景文件自动导出，审计者核的是"画面上真的有什么"。
    第一版导出脚本用正则取字符串，遇到含撇号的法文就切断——审计者据此怀疑代码进入画面；改用仓库的 `scripts/literals.ts` 后解决。建议把"导出全部画面文字"做成一个 just 命令。
14. **我自己的事实表错误被审计抓住。** 第二阶段把 OpenAI 的"按重要性筛选成果"写成"由人挑选问题"，又在"可用表述"里固化，旁白照抄——这是本片唯一的阻断项（R1）。
    教训：事实表的"可用表述"必须与原文的语态和主语一致；被动句不能补出施事者。
15. **片长的余量很紧。** 补强三处反方后，按 4 字/秒的假设全片 299.5 秒；为此压缩了停顿（见 revisions.md 末段）。配音（阶段 2b）到来后，若语速更慢，必须删句。
16. **两个会话共用一台机器的 GPU / CPU。** 另一个会话在主工作树上跑 `test-export`、`validate`、`regress`（SwiftShader）时，本片的 `just export` 两次超时
    （"Waiting failed: 60000ms exceeded"、"Runtime.callFunctionOn timed out"）。导出器没有给出"资源被占用"的提示，错误信息看起来像片子的问题。
    绕过：等对方空闲后用 2 个 worker 导出。建议：并行会话之间约定渲染时段，或导出器在超时时报告系统负载。
