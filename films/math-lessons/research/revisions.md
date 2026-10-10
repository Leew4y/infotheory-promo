# 修订记录（第五阶段：依据独立审计）

审计：v1 冻结稿（提交 12024db）的独立盲审，原文见 [../review/04-audit-v1-report.md](../review/04-audit-v1-report.md)；
逐条核实见 [../review/04-audit-v1-verification.md](../review/04-audit-v1-verification.md)。
本表只收**核实为真实**的错误与缺陷；每条给出 v1 的原句、证据（来源与位置）和 v2 的改句。"争议"项由 Develata 判断，结果记在末尾。
v2 的完整文本：script/narration.v2.md、script/captions.v2.md（由场景文件导出）、script/storyboard.v2.md。

| # | 级别 | v1 原句 / 位置 | 证据 | v2 改句 / 处理 |
|---|---|---|---|---|
| R1 | 阻断 | 旁白第 11 句、release 画面："据它自述：约四千个问题，由人提出，由人挑选。"；声音章："而在已公开的记录里，问题仍由人提出。" | S5 初始 README："the model was posed approximately 4,000 problems. Aggregating the output into result families and manuscripts and requiring an appropriate level of significance led to the catalog"——被动句，没有说谁提出问题；按重要性筛选的是**成果**。S7 只说明纳维–斯托克斯那一次由团队选题，不能推广。S3（Leiden）第 171 行另说存在 "both human-authored and computer-generated" 的问题。错误源头是事实表 F-N17 的"可用表述"（第二阶段我的误写） | "据它自述：评估中向模型提出了约四千个问题，再按成果的重要性整理成目录。"；删去声音章那一句。F-N17 改写并把这两种说法列入"禁用表述"；F-N09 限定为只适用于那一次工作 |
| R2 | 误导 | 第一章连祷："为数学辩护的人，一再这样说：用途，以后会来。"随后"可 Hardy 说：不。"；画面"数学家间接地更造福人类""伟大的发现，多出自好奇心" | Flexner p. 548："I am not for a moment suggesting that … an ultimate practical use is its actual justification."；p. 552："Not for a moment, however, do we defend the Institute on that ground."；Russell："Utility, therefore, can be only a consolation in moments of discouragement, not a guide"；Fontenelle p. 13"心智有它的需要"。Russell 原文有 often；Flexner 原文限定"最终造福人类的" | "为数学辩护的人，谈过日后的用途，也谈过求知本身。"；画面每人两行（用途一行、求知一行），恢复"常常""最终造福人类的"，Flexner 加"绝不以用途为研究院辩护"（新事实 F-H21）；Hardy 处改为"Hardy 说得更彻底"，画面"不以用途辩护"，去掉对立 |
| R3 | 反方不足 | 声音章："反方必须说出来：这样的系统，正是 AI 安全研究所担心的情形。""即使有一天它会自己选择，它的答案也更需要检验。" | 反方只说出名称，没有理由；"AI 安全研究所担心"是无事实编号的领域归属；检验答案不能替代检验目标与后果 | "反方必须说出来：自主，不等于可以接受；一个系统可以正确地完成一个有害的目标。""所以，即使有一天它会自己选择，要检验的也不只是答案，还有目标、行为与后果。"（不再归属于某个研究领域） |
| R4 | 语境缺失 | 声音章随笔句"那是世界上出现了另一个会自己决定什么值得追求的存在。"前没有假设语境；画面只标"随笔" | essay.md 第 71–109 行先说"有一天……到了那一刻"，才接这句 | 前加本片的一句"随笔设想，有一天——"；随笔标签改为"随笔 · 价值判断与思辨"（画面可见） |
| R5 | 数学错误 | numbers 画面：M^φ(n) ≡ 1 (mod n)，无条件 | S12 §VI："for any integer (message) M which is relatively prime to n"；反例 n = 15、M = 3：φ(15) = 8，3⁸ = 6561 ≡ 6 (mod 15) | 同屏加"当 gcd(M, n) = 1" |
| R6 | 反方不足 | 题面章："反方说：题面就是契约。按契约解决了，就是解决了。" | 同一报道 S9 第 45 段 Córdoba："All fluids we know of are under some kind of external force … So to have the force makes complete sense."；S14 四种表述 "retaining the heart of the problem" | 以 Córdoba 的直接辩护替换"契约"一句（新事实 F-N27，并注明该构造沿用了他的方法）；加本片一句"若证明成立，有外力的情形自有价值；只是它不等于无外力的情形。" |
| R7 | 定性不当 | 分镜 v1 与 F-P01 把 RSA 时间轴称为"'无用'预言的落空" | Hardy §25 "at present at any rate"、"Time may change all this." | 删去"落空"定性；numbers 画面加小字"Hardy 也写过：'时间也许会改变这一切。'（§25）"（序数 5）；F-P01 改写 |
| R8 | 交代不足 | 检验章只讲内核漏洞；v1 压缩记录称 AGMAI"开始，不是完成"与"这不说明其余都错了"同义 | AGMAI 原文讲 human understanding 与纳入数学知识，并非同义；S3 威胁 1 指出形式化与人类表述之间的"转译"难题 | kernel 画面加小字（◇）"还要核对：形式化的命题是不是原来的问题；新颖与重要，另行判断。"；压缩记录的"同义"说法在 narration.v2 中更正 |
| R9 | 反方不足 | 第二章："反方会说：机器更快，人的投入就是浪费。也许。可不停止探索，需要的只是这份意义。" | 更强的反方是机会成本：个人意义不能单独决定有限经费与岗位的分配（facts F-V01 已要求说出；Russell 的"自私的拒绝"也是对他人的责任） | "反方会说：人做数学有意义，也不能单凭这一点，决定有限的经费与岗位怎样分配。""这是真的。本片只说：不应因此停止探索。" |
| R10 | 事实表 | F-H19："TLS 1.3 标准要求所有合规实现支持 RSA 签名" | RFC 8446 §9.1 的前提："In the absence of an application profile standard specifying otherwise" | F-H19 补回前提；旁白"写进了互联网的加密标准"不变 |
| R11 | — | 审计建议片尾写"经独立审计" | — | **争议**，Develata 决定：片尾不写审计（2026-10-09） |
| R12 | 小 | brief 写 295 秒、余量 5 秒；storyboard v1 写 40 句（实际 39）；Russell 书目版本未区分 | 文件核对 | v2：时长 299.5 秒（8,985 帧），旁白 41 句；brief、storyboard.v2 更新；sources.md 写明 Gutenberg 本据 1917 年版 / 1918 年印本 |
| R13 | 小 | 摆线演示未写理想模型 | — | 画面小字"理想模型：同一条倒置摆线 · 静止释放 · 匀强重力 · 无摩擦" |
| R14 | 导出器错误 | captions.v1.md 中法文被截断、混入代码片段 | 我的导出脚本用正则取字符串，遇撇号即断；成片画面无此问题（渲染帧可见完整法文） | captions.v2.md 改用仓库的 scripts/literals.ts 扫描器导出 |

审计中核实为**不成立**或已经满足的部分（不改）：
- 审计第 4 条称画面没有随笔标签——实际已有"随笔"小字（审计者未看到渲染）；v2 仍把标签改为"随笔 · 价值判断与思辨"。
- 审计第 14 条怀疑代码片段进入画面——没有（见 R14）。

时长：v1 299.0 秒 → v2 299.5 秒。补强反方增加约 15 秒，按 Develata 同意的办法，用压缩停顿抵消：句间停顿 0.55 → 0.45 秒、
场首尾留白 0.6 → 0.5 秒、启应答句提前 0.6 秒浮现、小字与旁白重叠出现、片名 5 → 4 秒、索引页 11 → 7.5 秒；没有删去论证。

## 复核审计（v2 → v3）

v2 的复核审计（同一独立审计者，推理强度 high）结论：**通过，无阻断项**；上一轮第 3、6、8、9、10、11 项已结案，其余部分结案。新发现逐条核实后处理如下：

| # | 级别 | v2 原句 / 位置 | 证据 | v3 改句 / 处理 |
|---|---|---|---|---|
| R15 | 应修（新增错误） | 旁白第 7 句："Hardy 说得更彻底：不能以用途……" | "更彻底"是无依据的比较：Flexner 同样否认用途是研究的正当理由（S15 pp. 548、552） | "Hardy 也写道：不能以用途，为一位真正的数学家的一生辩护。" |
| R16 | 应修（遗留） | defenders 画面："看似无用的，日后会显出用处" | Fontenelle p. 9 说的是"有的思辨起初无用，后来有用"，p. 11 还承认有些真理永远无用 | "有些看似无用的研究，日后会显出用处" |
| R17 | 应修（遗留） | facts.md E04 用法栏仍写"配 F-N09、F-N17（在公开记录里，问题由人提出）" | 与 R1 的结论冲突 | 删去该概括，注明这两条不能证明问题由人提出 |
| R18 | 应修（遗留） | sources.md S2 解读仍称 Hardy"错在……时间尺度"、"关于'无用'的预测会失败" | Hardy §25 "at present at any rate"、"Time may change all this" | 改为"应用状态后来变了，现有材料不足以判定其预测被证伪"；narration.v3 标明 v1 的"落空"说法已废止 |
| R19 | 小（新增错误） | sources.v2 写 Gutenberg 底本版权页"列至 1925 年 8 月第六次印刷" | 版权页实际列至 1959 年第十一次印刷 | 已改正 |
| R20 | 小（遗留） | 摆线画面"从任何高度放开" | 从最低点释放时质点不动，不存在正的下落时间 | "从最低点以上的任何高度静止放开" |
| R21 | 小 | storyboard.v2 的序数 7 未映射 F-M01；余量参数前后两套（0.2 / 0.45 与 0.22 / 0.55） | 文件核对 | storyboard.v3 补 F-M01，参数统一为 0.2 秒与 0.45 秒 |

复核审计的"需核实"项（导出表不能证明标签与记号确实显示）：我在渲染帧上核对过——◇、序数、"随笔 · 价值判断与思辨"与"反方"标签、完整法文均显示（out/math-lessons/v2-check.jpg 等；终版拼图见 review/05）。
