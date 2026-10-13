# 10 · v4 的 Codex 审计原文

两轮独立审计的原文（gpt-6-astra，max，WSL 只读沙箱）。逐条处理见 research/revisions.md（第一轮 R22–R27；PR #9 审阅 R28–R35；第二轮见下文末尾的处理记录）。

## 第一轮（2026-10-13，v4 草稿第 1–37 句）

**PASS / no blocker；发现 4 项 SHOULD_FIX、2 项 NEEDS_VERIFICATION。**以下使用稿内第 1–37 句编号。审阅以当前工作树为准；v4 本身也有未提交修改。

1. **SHOULD_FIX｜[第 5 句](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:25)｜题面转述遗漏关键量词，画面说明也未补齐**

   原句：“要么证明，没有外力时，水流永远不会失控；要么证明，选一个合适的外力，水流会在某一刻失控。”

   **证据：**F-M04 允许的是“四个可选命题……证明其中任意一个即可”。官方题面第 2 页中，A/B 针对**任意**符合条件的光滑初始速度场；C/D 要求**存在**符合条件的初始速度场和光滑外力，使全时间的合格光滑解不存在。A/C 是 ℝ³ 情形，B/D 是空间周期情形，并有相应衰减、周期和能量条件。[Clay 官方题面，pp. 1–3](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf)

   **机制与影响：**把四项归为“两类路线”可以接受，有限时间破裂的概括也有依据；问题在于“水流失控”容易被听成现实水流紊乱，而画面的“光滑解对所有时间存在”仍漏了“对任意合规初始状态”。只展示静止解永远光滑，显然没有证明 A/B。

   **最小修复：**旁白补模型范围和量词；画面补 A/C 与 B/D 的空间区别及条件。
   
   **替换句：**“在题目限定的三维流体模型里，一条路是证明任何合规的初始流动在无外力时都能一直光滑演化，另一条路是找出合规的初始流动和光滑外力，让解在有限时间内出现奇点。[F-M04]”

2. **SHOULD_FIX｜[第 9 句及其衔接](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:31)｜R6 的修复被删去一半**

   原句：“回答了题目，不等于回答了问题。”

   **证据：**[R6](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/revisions.md:15) 的处理不仅加入 Córdoba 的辩护，还加入“若证明成立，有外力的情形自有价值；只是它不等于无外力的情形”。v3 第 21 句明确保留，v4 删除。F-N12 又限定“主要问题没有解决”只能作为具名数学家的判断。

   **机制与影响：**Córdoba 的反方引语仍在，不能说反方完全消失；但紧接着由本片用复沓句收尾，容易把“另一种问题仍开放”变成“这项成果没有回答真正的问题”，削弱对其独立价值的承认。

   **替换句：**“本片认为，若证明成立，有外力的情形自有价值，只是它不等于解决了无外力的问题。[价]”
   
   第 35 句仍可保留原复沓句。

3. **SHOULD_FIX｜[第 10 句](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:37)｜经验性断言不能靠 `[价]` 免除举证**

   原句：“很多人听到‘机器会证明定理’，第一反应是：那人还做数学干什么？[价：误解的转述，不是事实]”

   **证据：**facts.md 的规则要求“每一句事实性陈述”有事实编号；现有事实表没有支持“很多人”及其“第一反应”的条目。F-N23 只支持 Aaronson 的个人判断。

   **机制与影响：**引号内可以是设问，但引号外仍声称一种普遍程度和心理反应。标成价值判断并不能改变其性质；而“人还做数学干什么”也可能是在询问职业和资源分配，并非天然属于误解。

   **替换句：**“机器会证明定理，就意味着人不必再做数学了吗？[价]”

4. **SHOULD_FIX｜[第 13 句](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:41)｜“最无用”没有所引事实支持**

   原句：“他没有看到：他眼中最‘无用’的数论……”

   **证据：**F-H17 支持“数论后来成了公钥密码的数学基础……Hardy 生前没有看到”，没有支持“最”的比较。更值得警惕的是，原著 §21 中的 *supreme uselessness* 出现在一则归于高斯的传闻中，Hardy 随即表示找不到准确引文，并认为它受到误解，不能直接挪成 Hardy 自己的排名。[Hardy 原著转录本，§21](https://web.njit.edu/~akansu/PAPERS/GHHardy-AMathematiciansApology.pdf)

   **机制与影响：**新增最高级夸大了历史人物的立场；“他没有看到”脱离“生前”，听觉上还可能接近“他没有预见”，而 F-H13 明确保留了他对未来变化的承认。

   **替换句：**“哈代眼中‘无用’的数论，在他身后成了公钥密码的基础，写进了互联网的加密标准。[F-H17]”

5. **NEEDS_VERIFICATION｜[第 11 句](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:38)｜“三百多年前”的版本依据尚未闭合**

   原句：“三百多年前，就有人替数学回答过类似的质疑……”

   **证据：**F-H01 明确写着“核对的是 1742 年重印本”“写作日期未核”，可用说法是“为 1699 年卷所写的序言”；S1 又注明初印本与重印本文字差异未核。本次查到法国国家图书馆书目记录：该刊年卷从 1699 年开始，出版从 1702 年开始，但未能打开初印本正文。[BnF 书目，Numérotation／Publication](https://catalogue.bnf.fr/ark:/12148/cb32786820s)

   **机制与影响：**这不等于违反了“不得说 1699 年写成”，也不能判定“三百多年前”为假；但当前逐字核验依据仍是距 2026 年仅 284 年的重印本，需要把更早版本的依据补入事实表。“类似质疑”也宜明确落在数学用途，避免听成古人已经回答了机器替代人的问题。

   **替换句：**“在巴黎科学院一六九九年卷的序言里，一位辩护者回应了‘数学无用’的质疑：人们乐于把自己不懂的东西称为无用，这是一种报复。[F-H01][F-H02]”

6. **NEEDS_VERIFICATION｜[第 26 句及检验章画面](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:66)｜须确认 R8 的区分随 v4 保留**

   原句：“公布，不等于检验。要紧的是独立，不一定是人工。”

   **证据：**任务书要求分别判断形式化正确、语义转译、新颖性和重要性；R8 因此增加了画面句“还要核对：形式化的命题是不是原来的问题；新颖与重要，另行判断”。这句话目前仍在 [kernel.ts](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/kernel.ts:54)，但 v4 没有明确写出沿用安排。

   **机制与影响：**现有代码证明旧处理尚在，不能据此断言已经退化；但若制作 v4 时只迁移新稿明确列出的文字，就会重新只谈检查器漏洞，丢掉 R8 修补的层次区分。

   **最小修复：**在 v4 明确保留该画面句。若决定全部交给旁白，则替换为：
   
   “公布不等于检验，要紧的是独立而不一定是人工，还须核对形式化的命题是否忠于原题，新颖性和重要性则另行判断。[价]”

其余重点核对结果：

- **第 3–4 句、F-H22/S24：成立。**“OpenAI 宣布”保留了说法归属，“看来”没有升级成确认；700 万美元总奖金、每题 100 万美元与官网一致，稿中也要求同屏注明无意申领。[OpenAI 公告](https://openai.com/index/navier-stokes-solution/)、[Clay 声明](https://www.claymath.org/news/navier-stokes-announcement/)、[Clay 奖金说明](https://www.claymath.org/millennium-problems/)
- **第 7–8 句：不必强制念姓名。**F-N12 的“只说‘有数学家认为’并具名”和 F-N27 的“片中如引用须具名”，都没有规定姓名必须进入旁白；明确对应的画面姓名可以满足要求。
- **第 14、16、18 句：未发现额外失实。**第 14 句保留了谦抑限定；第 16 句仍是个人预期，并安排同屏补充 F-N23/F-N24；Avigad 的研究身份和引述均有一手依据。[Avigad 本人主页](https://www.andrew.cmu.edu/user/avigad/)、[原文](https://terrytao.wordpress.com/2026/10/05/the-future-of-mathematics/)
- **第 23、25 句：没有触犯“AI 骗过 Lean”的禁句。**描述的是漏洞导致错误接受，没有归因于欺骗意图；报告后一小时推出修复补丁，以及安全 AI 协助找出更多错误，均获官方复盘支持。[Lean 复盘，What happened／What the FRO is doing](https://leodemoura.github.io/blog/2026-8-1-postmortem-for-kernel-soundness-bug-14576/)
- **第 30 句：转述可接受。**原文确实讨论退入沉思、没有分担他人苦难的疑虑；“躲进数学的沉思里”保留在自问语境中，没有变成罗素认定数学研究自私。[Russell，《数学研究》，p. 72](https://www.gutenberg.org/cache/epub/25447/pg25447-images.html)

整体结构没有明确制造历史因果推断；第 19 句的资源分配反方、第 28 句的有害目标反方均保留。主要退步是 R6 的价值承认被删弱。

**验证：**已逐句核对 37 句、当前事实表及 R1–R21，并直接对照 v3；所有引用编号存在，第 37 句与任务书逐字一致；未修改文件。**未运行：**视频渲染、实际配音及 Lean 证明验证，本轮为文本审查；v4 成片中姓名、限定语和价值标签的可见性仍属 NEEDS_VERIFICATION。



## 第二轮（2026-10-13，PR #9 修订后的工作树）

发现 **2 项 SHOULD_FIX**，未发现已证实的 BLOCKER。全程未修改文件。

1. **SHOULD_FIX｜Aaronson 引文漏掉事实表要求保留的立场**

   **证据：**[needed.ts:15](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/needed.ts:15) 保留了“不再……真正被需要”和“乐趣与启迪”，没有呈现 F-N24。[facts.md:80](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/facts.md:80) 明确要求“与 F-N23 一起用，避免断章取义”；[narration.v4.md:59](/mnt/e/gitclone/infotheory-promo/films/math-lessons/script/narration.v4.md:59) 却声称画面已经包含 F-N24。[Aaronson 原文](https://scottaaronson.blog/?p=10062) 确实还表达了继续维护洞见与理解在数学中地位的意愿。

   **机制与影响：**脚本的完成声明与实际画面不符，作者对数学研究目标的积极立场呈现不完整。这是引用完整性问题，现有“乐趣与启迪”译文没有错误。

   **最小修复：**同页沿用编号 10，补上：“他仍想让‘洞见与理解’留在数学的中心，能留多久就留多久。”无需改写整段旁白。

2. **SHOULD_FIX｜作为约束文件的论证图仍保留已被禁止的断言**

   **证据：**[argument-map.md:191](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/argument-map.md:191) 将“问题是人提出并筛选的”标为已核实，[第 252 行](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/argument-map.md:252) 据此断言自主设定目标的条件“目前不成立”。这与 [F-N17](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/facts.md:73)、R1 相冲突：[OpenAI README](https://github.com/openai/math#how-the-results-were-produced) 没有说明谁提出问题，按重要性筛选的对象是成果。另外，[第 245 行](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/argument-map.md:245) 仍写 Clay 称问题“显然已经解决”，违反 F-N11 对 apparently 的限定。[Clay 原文](https://www.claymath.org/news/navier-stokes-announcement/) 支持“看来”，不支持“显然”。

   **机制与影响：**当前影片已避开这些错误，但其论证依据仍自相矛盾，后续按论证图修改或验收可能重新引入错误。

   **最小修复：**C7 改为 F-N17 的被动表述；H2 改为“这些公开材料不足以据此判断系统是否能自主设定研究目标”；H1 改为“看来已经解决”，并同步 R6 已采用的反方表达。

本轮重点改动的核对结果如下，均指文件与程序层面的结果：

| 项目 | 结论 |
|---|---|
| n22、E09、E06 恢复 | 已进入实际场景注册。[dispute.ts:31](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/dispute.ts:31) 从条件性承认价值接到“什么值得问”；[voice.ts:29](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/voice.ts:29) 先给 E06，再给反方和目标、行为、后果的检验要求。结构上已补回反驳对象。 |
| 开场是否公平 | [claim.ts:35](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/claim.ts:35) 两句均为 34px；保留 OpenAI 的说法归属、Clay 的“看来”和缓慢评审限定，与[两方公告](https://openai.com/index/navier-stokes-solution/)及 [Clay 声明](https://www.claymath.org/news/navier-stokes-announcement/)相符。 |
| Hardy 引文与编号 | [hardy.ts:15](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/hardy.ts:15) 的一般命题对应 §21、编号 7；后一引文对应 §29、编号 9，与索引及[原书](https://web.njit.edu/~akansu/PAPERS/GHHardy-AMathematiciansApology.pdf)匹配。 |
| 编号、随笔与反方 | 核对了 1–16 的页边编号与索引。`◇` 和随笔标签确实不再绘制，“反方”仍绘制；索引交代随笔来源。按“同页有出处编号”的标准，未发现额外漏标的事实句或人物引语。 |
| 标点与字幕 | [displayText](/mnt/e/gitclone/infotheory-promo/engine/util.ts:65) 只处理行尾指定标点；字幕生成保留句子边界。实际生成的 33 条字幕未见跨句合并或因此改变命题含义。 |
| Fontenelle 归属句 | [useless.ts:24](/mnt/e/gitclone/infotheory-promo/films/math-lessons/scenes/useless.ts:24) 符合 F-H01：“1699 年卷”没有被说成“1699 年写成”，画面注明据 1742 年版本。该版原图本轮未能独立取得。 |

其余内容中，RSA 所用欧拉定理的互素条件与[原论文](https://people.csail.mit.edu/rivest/Rsapaper.pdf)一致；三篇撤稿与符号错误符合[仓库修订记录](https://github.com/openai/math/blob/main/history.md)；Lean 漏洞、报告后一小时修复及 AI 协助后续排错符合[作者复盘](https://leodemoura.github.io/blog/2026-8-1-postmortem-for-kernel-soundness-bug-14576/)。未发现把单个错误推广为全部成果错误，或把自检通过当作正确性的结论。

**验证：**

- `bun test tests/narration.test.ts`：11 项通过，50 个断言。
- 44 个旁白 ID、44 个 lock 条目、44 个 FLAC 对应完整；JSON 与 lock 的 `text/read` 一致，音频哈希、时长、缓存键及解码检查通过。
- 实际注册的 44 行均进入预期场景，无遗漏或重复；共 16 场、9547 帧，约 318.233 秒。
- 脚本配音条目与实际朗读文词一致，但存在引号、破折号写法差异，不能称为逐字符相同。脚本未逐项记载 `pause`；lock 本身不保存 `scene/pause`，场景归属另经注册结果核对。

**NEEDS_VERIFICATION：**未试听实际语音，未做真实浏览器或成片的视觉验收；绘制调用检查使用了 Canvas/WebGL 替身，不能确认错读、同步观感、遮挡和可读性。未运行完整工程检查及会生成输出的渲染、回归流程；本轮遵守只读和目录边界。[revisions.md:50](/mnt/e/gitclone/infotheory-promo/films/math-lessons/research/revisions.md:50) 引用的仓库外审计文件按要求视为不可用。

**PASS / no blocker。**此结论限于上述内容与一致性审查；未覆盖真实试听、像素验收、Fontenelle 原版扫描及相关数学证明本身的正确性。

处理：R36、R37（research/revisions.md），均已采纳。
