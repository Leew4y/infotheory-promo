# 01 · 风格方向（第三阶段，等待选择）

拼图：[01-directions-sheet.jpg](01-directions-sheet.jpg)（`just sheet math-lessons --times 3.5,14,23.5,43.5`；列：A、B、C；行：开场随笔、片名、第一章引文页（带字幕与序数）、铰链题面页）。
三个方向都是粗样：只定了色板、字体、底色、全幅着色器和字幕/序数的画法，没有做评审轮。

| | A 夜祷 · Vigil | B 静室 · Chapel | C 宣言 · Manifesto |
|---|---|---|---|
| 一句话气质 | 夜里的教堂：一支蜡烛照着羊皮纸色的字，玫瑰窗随全片慢慢透光 | 世俗的色域礼拜堂：大片柔边的颜色、极轻的字、大量留白 | 构成主义宣言：白底、黑字、信号红，条文式的编号，硬切 |
| 色板 | bg #0F0C0A／fg #EFE6D6／muted #A89679／accent 烛金 #E2B35E／alt 玻璃红 #C0504A、钴蓝 #5B7BC0 | bg 李子黑 #1E1219／fg #F3E9EE／muted #B9A1AE／accent 余烬 #EE8A6B／alt 紫 #9A7BB0、赭 #B08A68 | bg #FFFFFF／fg #0B0B0B／muted #555555／accent 信号红 #D0231B／alt 蓝 #1E3EB8、灰 #7A7A7A |
| 字体（catalog 标签） | ZCOOL XiaoWei（zh, serif, display, elegant, gb2312）→ Noto Serif SC；Instrument Serif；IBM Plex Mono | Noto Sans SC（细字重）；Manrope；IBM Plex Mono | Noto Sans SC（粗字重）；Space Grotesk；Space Mono |
| 页面底 | 暖黑，左上一团烛光 | 李子黑上两块柔边的暗色块（一次绘制后缓存） | 纯白，顶边一条黑粗线 |
| 全幅着色器：progress / highlight | 十二重对称的玫瑰窗：progress = 玻璃透光，highlight = 中心的火 | 上下两块柔边色域：progress = 由近黑变深红，highlight = 两块之间的一道亮缝 | 两组同心圆的莫尔纹：progress = 圆环变密变清晰，highlight = 一枚红色实心圆 |
| 序数 | 金色等宽小数字；◇ 为空心菱形 | 余烬色等宽小数字；◇ 为实心小菱形 | 大号红色粗体数字（像条文编号）；◇ 为黑色实心菱形 |
| 动效 | 慢淡入淡出（0.8 s），极慢推近 | 更慢（1.0 s），几乎不动 | 硬切（0.15 s），不推近，字直接出现 |
| 与 paper-dawn / nebula 的区别 | 暖黑与金、衬线展示体、玫瑰窗几何；nebula 是冷蓝、无衬线、点阵星空 | 李子色、无衬线细字、无线条无装饰；与两者都不同 | 纯白而非米色纸、粗黑体而非衬线、红而非锈色、无纸纹；平面、无渐变 |
| 服务于哪种"狂热" | 仪式与圣像：几何作圣窗，光作火 | 静默与冥想：留白本身是仪式 | 宣言与鼓动：编号、粗字、硬切 |
| 风险 | XiaoWei 字距偏松，长句略散；整体容易"太美"、显得煽情 | 对比度低的色域在投影上可能发灰；信息密的页面（题面表）显得单薄 | 最远离"庄重"，容易像海报而不像仪式；黑色挡板在全幅页上偏生硬 |

检查：`just check`、`just check-imports` 通过；`just validate math-lessons`（三个方向，12 场次 × 5 帧，306 个文字框）首次在 C 的序数上报了 3 个安全区错误（序数离页边太近），
修正 `lib.ts` 中序数的偏移后为 0 error、0 warning。只覆盖目前的 4 场草稿；其余 11 场尚未实现。

我的推荐：**A 夜祷**，但收敛它的"美"——玫瑰窗只在全幅页出现，页面保持暗而素；理由：它最直接地承载"世俗宗教感"与"火"的结尾意象（highlight 就是火），
序数的金色在暗底上最像经文的章节号。B 是更克制的备选；C 与片子的庄重最远，但若你想要"理性的狂热"更锋利，它最有力。
