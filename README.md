# 信息论：不确定的度量

一部约 3 分 22 秒的信息论短片。画面由 TypeScript 在 HTML Canvas 与 WebGL2 上逐帧绘制；配乐与音效由 Python 合成。
视频为 1920 × 1080、30 fps，含中英双语文案。每一帧都是时间 `t` 的纯函数；离线导出每帧取 3 个运动模糊子帧，浏览器里的实时预览只取 1 个，其余相同。

技术流程参考了 [abstract-algebra-promo](https://github.com/AnctyEnly453/abstract-algebra-promo)（小节网格、GPU 子帧累积运动模糊、页面导出音效 cue 表给 Python 合成配乐、多进程 Chrome 逐帧导出）和 [pdoom-video](https://github.com/mexicat/pdoom-video)（TypeScript 场景引擎、一场景一文件）。外观是另一套：暖纸面、墨线、一种朱红点色、衬线字、程序生成的黎明地平线，克制而缓慢。

## 外观：纸与黎明

- **两种页面**。章节页是米白纸面（带纤维纹理和轻微暗角），图表全部是细墨线，唯一的强调色是深朱红 `#9E421C`，次要色是石板蓝和灰绿；`just validate` 在每个场景抽样的 5 帧上按导出画面逐字检查对比度，均达到 WCAG AA（抽样检查，不是逐帧证明）。章节之间和首尾是全幅的黎明地平线：程序生成的天空渐变、地平线上的暖色光带、弧形的暗色大地、薄雾和一轮初升的太阳，加胶片颗粒。
- **字体**。中文 Noto Serif SC 500 字重；英文 Gelasio 小字与斜体；公式 STIX Two Text（STIX Two Math 兜底）；比特用 Inconsolata。全部随仓库分发（OFL，许可证在 `films/infotheory/fonts/paper-dawn/`）。标签是小型大写加字距。
- **版式**。左右各 150 px 的编辑式网格：左上角章节号加细线加章名，右下角页码 `01 / 08`，左栏是本章的一句论断，右栏是图表；说明文案排在左下，前面一段朱红短线，英文斜体在下一行。
- **动画**。墨线一笔笔画出来，文字淡入并上浮 12 px，页面只有缓慢推近；转场是经纸面或暗色的溶解，没有闪切、震动和白闪。
- **后期**。章节页只有细颗粒和很轻的暗角；地平线页多一点颗粒、暗角和太阳周围的光晕。没有辉光、没有色差。

## 第二套外观：星云（nebula）

同一套场景代码换一个风格包：`just dev` 后打开 `http://127.0.0.1:5174/?style=nebula`，导出用 `just export 4 18 --style nebula`（→ `out/infotheory-nebula.mp4`）。
深蓝黑底加固定点阵和稀疏星点，全幅页是缓慢流动的星云；无衬线字（Noto Sans SC、Inter、JetBrains Mono，公式仍是 STIX Two）；
青色强调、琥珀色辅助，页面线条带一点光晕；转场是从四周收拢的光圈；章节号 `CH 01 / 08` 和章名在右上，顶部一条章节进度细线；文案居中在半透明底条上。

## 内容

| 场景 | 小节 | 时间 | 内容 |
| --- | --- | --- | --- |
| dawn | 0–5 | 0:00–0:15 | 初光；两句话；标题「信息论」 |
| preface | 5–8 | 0:15–0:24 | 序：一枚硬币、一封信、一张照片、一段基因，四幅小墨线画 |
| 01 惊讶 | 8–14 | 0:24–0:42 | I = −log₂ p 的曲线画出；硬币 1 比特、日出约 0、头奖 23.3 |
| 02 熵 | 14–20 | 0:42–1:00 | 八个结果的分布从均匀到尖峰，H 从 3.00 到 0；英文字母 4.70 → 4.14 → 约 1 比特 |
| dusk1 | 20–22 | 1:00–1:06 | 地平线：信息，是被消除的不确定 |
| 03 压缩 | 22–29 | 1:06–1:27 | 霍夫曼树逐次合并；同一消息 30 比特变 22；3.00 / 2.45 / 2.40 |
| 04 噪声 | 29–34 | 1:27–1:42 | 一行比特里有几个被划掉翻转；INFORMATION 变 INF0RMAT1QN；二元对称信道 |
| 05 纠错 | 34–40 | 1:42–2:00 | Hamming(7,4) 三圆图：校验、翻转、定位、修复；汉明码、RS 码、旅行者号、5G |
| dusk2 | 40–42 | 2:00–2:06 | 地平线：只要肯多花几个比特，噪声就不是终点 |
| 06 容量 | 42–48 | 2:06–2:24 | C = B log₂(1+S/N)；容量线上下的斜线阴影；1948 → Turbo → LDPC → 极化码 |
| 07 互信息 | 48–54 | 2:24–2:42 | 两个熵的重叠；训练模型 = 让 q 逼近 p，损失是交叉熵 |
| 08 无处不在 | 54–61 | 2:42–3:03 | DNA、兰道尔极限、黑洞、语言模型、5G、JPEG：同一个单位 |
| morning | 61–64.2 | 3:03–3:13 | 太阳升起：它把不确定变成可以计算的量；1948 年，一篇论文，一门学科 |
| sources | 64.2–66 | 3:13–3:22 | 参考文献页 |

片中的数字：log₂ 26 = 4.70；英文单字母熵 4.14 比特（Shannon 1951 的 F₁）；上下文下约 1 比特/字母；霍夫曼例子六个符号 A .35 B .20 C .15 D .12 E .10 F .08，码 A 11、B 01、C 101、D 100、E 001、F 000，平均码长 2.45，熵 2.395；Hamming(7,4) 数据 1011 校验 010；Turbo 码 1993、LDPC 重新发现 1996、极化码 2008/2009；人类基因组约 3.1 × 10⁹ 碱基 × 2 比特；兰道尔极限 kT ln 2 在 300 K 约 2.9 × 10⁻²¹ J。参考文献列在片尾。

## 工程结构

分三层，依赖方向 `films → styles → engine`（`just check-imports` 强制）。风格、字体、合成器、新片模板是可复用的库；场景与配乐跟着内容走，留在各自的片子里。片子之间、风格之间不互相导入。计划见 `docs/plan/reusable-engine.md`。

```
engine/               与片子无关
  index.ts            公共 API：片子只能从这里导入
  film.ts             帧率、小节网格（BPM）、章节数与解析后的时间轴（帧为权威单位），由片子的 film.ts 声明
  style.ts            风格包接口与当前风格：语义色板 C、字体 F、版式 M/COL、background/plate/statement/row
  scene.ts            场景注册表：page / plate 两种，时长 dur（秒，可用 bars(n)）、文案、音效 cue、镜头；起点按顺序累加
  frame.ts            帧管线：场景层 → 运动模糊累积 → 后期 → 风格的章节标签、页码、文案叠加
  draw.ts             绘图原语：文字、细线、笔画、圆、阴影线、箭头、比特行
  gl.ts               WebGL2：风格背景着色器、子帧累积、颗粒与暗角调色
  schema.ts           FilmSpec / SceneSpec（zod），注册时校验
  boot.ts             页面入口：预览播放器与导出钩子 __frame/__layout/__cues/__timeline/__duration/__scenes/__film
styles/paper-dawn/    "纸与黎明"风格包：色板、字体链、纸面、地平线着色器、调色、版式块、叠加层；fonts.json 引用字体库
styles/nebula/        "星云"风格包（同样的接口，另一套外观）
fonts/catalog.json    字体库（42 个字体文件，全部 OFL）：上游来源（固定到提交）、sha256、字重、许可证与选用标签；风格按 id 引用
templates/film/       新片骨架（标题、一页正文、结尾，无配乐），just new-film 复制它
templates/style/      新风格包骨架（接口齐全、可通过全部检查），just new-style 复制它
engine/capture.ts     录屏素材：清单、剪辑（截取 / 剪掉 / 变速）、镜头与坐标映射
engine/demo.ts        产品演示场景：录屏放进风格化的窗口，镜头推拉、合成光标与点击波纹
engine/media.ts       素材帧的按需加载、解码与内存上限缓存；导出时缺帧即报错
films/infotheory/     信息论短片（参考片）
  film.ts             帧率、BPM、章节数与可用风格（第一个是默认，页面 URL 加 ?style=<id> 切换）
  main.ts             入口：film → scenes → boot()
  scenes/*.ts         一场景一文件，index.ts 决定顺序
  score.py            配乐编曲：按"场景 + 场景内小节"定位，读 timeline.json 与 cues.json
  cues.json           页面导出的音效 cue 表（生成文件）
  timeline.json       页面导出的解析后时间轴（生成文件）
  fonts/<style>/      每个风格一套随仓库分发的字体子集（just fonts 生成）与 manifest.json
  regress/<style>.json   每个风格一份像素回归基线
index.html            所有片子共用的页面外壳：一个 1920×1080 的 canvas、开始卡片、播放条；入口由 just dev/build <film> 选择
scripts/export.ts     导出：N 个 headless Chrome 各自渲染精确帧时刻，按序写入 ffmpeg；先写临时文件、校验后替换成片；也出检查帧、cue 表和时间轴
scripts/test-export.ts  导出失败用例（缺音频、音频过短、浏览器启动失败、编码失败、中断、超时、并发）
scripts/chrome.ts     共享的 Chrome 启动参数（CPU 2D canvas；Windows 用 ANGLE D3D11，其他平台用浏览器默认；或 SwiftShader）
scripts/fonts.ts      按字体库下载字体、按片子用字裁剪子集、检查覆盖
scripts/font-catalog.ts  字体库本身：下载并校验全部字体；--lock 登记新字体（与 GitHub 的文件哈希核对、测出字重）
scripts/new-film.ts   从模板新建片子
scripts/regress.ts    像素回归：SwiftShader + CPU 2D canvas 下逐帧比较原始 RGBA 哈希
scripts/validate.ts   校验：声明、时间轴、文字是否出画面或出安全区
scripts/check-imports.ts  依赖方向检查
audio/synth.py        合成库（numpy/scipy）：毛毡钢琴、弦乐、大提琴，翻页、落笔、轻钟等音效，混响、混音、母版；成品写到 out/<film>/
spikes/               阶段 0 的验证实验与结果（spikes/RESULTS.md）
justfile              一键命令
```

## 运行

需要 bun、uv、just、Chrome 或 Edge、PATH 上的 ffmpeg。所有片子相关的命令第一个参数是片名（省略时为 `infotheory`）；生成的东西都在 `out/<film>/`。字体来自字体库 `fonts/catalog.json`（OFL），按片子用到的字、每个风格各裁剪一套子集放在 `films/<film>/fonts/<style>/` 并入库；改了文案之后运行 `just fonts <film>`（第一次会下载完整字体到 `.cache/fonts`，需要联网）。渲染时任何一个字没有随仓库字体覆盖都会直接报错。

```
just setup                    # bun install + uv sync
just new-film demo nebula     # 从模板新建 films/demo/（风格 nebula），之后 just fonts demo
just new-style ink-wash       # 从模板新建风格包 styles/ink-wash/（含 STYLE.md 设计说明骨架）
just import-capture demo app ~/rec/app.mp4   # 把 OBS 等任意录屏导入为片子 demo 的素材 app（帧在 .cache/，清单入库）
just capture demo web demo-scenario.ts       # 用 Playwright 按脚本录制网页演示，同时记录点击
just captures demo ~/rec      # 换机器或清了缓存后，从源视频重建全部素材帧（按 sha256 校验）
just dev <film>               # 预览 http://127.0.0.1:5174 ：空格播放/暂停，←/→ 5 秒，, . 单帧，[ ] 跳场景，F 全屏；?style=<id> 切换风格
just shots <film> 5,20.5      # 写检查帧到 out/<film>/shots/（加 --style nebula 写到 shots-nebula/）
just cues <film>              # 页面 → films/<film>/cues.json 与 timeline.json
just music <film>             # cues → films/<film>/score.py → out/<film>/music.wav（母版，导出用）与 music.mp3（预览用）
just export <film>            # 4 个 Chrome 进程逐帧导出 → out/<film>/<film>.mp4（crf 18）；没有配乐的片子加 --noaudio
just all <film>               # cues → music → export
just check                    # 类型检查
just check-imports            # 依赖方向
just validate <film>          # 所有风格：声明、时间轴、渲染、文字版面（出画面、出 5% 安全区、文字互相重叠、对比度低于 WCAG AA 都是错误）；--style <id> 只查一个
just sheet <film>             # 对照拼图：同一批代表时刻、每个风格一列 → out/<film>/sheet/sheet.jpg（--style a,b；--times t1,t2）
just test-validate            # 版面检查的故意出错用例（用模板临时建一部片子，结束后删除）
just fonts <film>             # 文案改动后重新生成所有风格的字体子集（--style <id> 只生成一个）
just font-catalog             # 下载并校验字体库里的全部字体（约 80 MB 缓存）；新增字体需 Develata 确认后用 --lock 登记
just test-export <film>       # 导出失败用例（需要一部有配乐的片子）
just regress <film>           # 所有风格的像素回归，每个风格一份基线（--update 重写，--style <id> 只跑一个）。基线只在录制它的平台上可比较（目前是 Windows x64），其他平台会直接退出并提示
```

预览需要 `out/<film>/music.mp3` 存在（`just music <film>`），否则页面按内部时钟播放、无声。

## 它是怎么工作的

- **时间网格**：帧（30 fps）是权威单位；小节网格 80 BPM，一小节 3 秒。每个场景只声明时长 `dur`（秒，常写成 `bars(6)`），取整到帧，起点按注册顺序累加，没有空隙、不累积误差；文案、音效 cue、镜头运动都写成场景内的局部时间。改一个场景的长度，后面的场景自动顺延；`just cues` 写出 `timeline.json`，配乐按场景定位，跟着走。
- **确定性**：绘制函数只接收 `lt`；随机数全部来自固定种子，颗粒由帧号播种。导出（3 个运动模糊子帧）与预览（1 个子帧）不完全相同。所有启动器都带 `--disable-accelerated-2d-canvas`：硬件加速的 2D canvas 会让像素依赖渲染顺序（见 `spikes/RESULTS.md` 0a）。
- **帧管线**（`frame.ts`）：一帧先在 Canvas2D 上画场景层（缓慢推近、场景首尾经纸面或暗色的淡入淡出），上传到 WebGL 累积缓冲；导出时每帧画 3 个子帧（快门 0.5 帧，带亚像素抖动）求平均得到运动模糊；随后是颗粒、暗角、明暗分离的轻微冷暖调色，地平线页另加一点光晕；结果画回 canvas，最后叠加不受模糊影响的章节标签、页码和文案。
- **地平线**：一个全屏片元着色器：按参数 `p`（时刻）在深蓝到晨蓝之间插值天空，地平线附近叠加暖色光带，大地是一条抛物线以下的暗色，fbm 噪声做薄雾和条状云，`q` 控制太阳高度。
- **导出**：页面在 `?export=1` 下暴露 `__frame(t, fps)`，渲染该时刻并返回 JPEG；`scripts/export.ts` 起 N 个独立的 headless Chrome，把帧号交给空闲的进程，收回后严格按序写入 `ffmpeg -f image2pipe -c:v mjpeg`，再与 `out/<film>/music.wav`（母版）混合成 H.264 + AAC。在 CPU 2D canvas 下，任何进程数得到相同的页面帧；GPU 上的地平线着色器偶有 1 个色阶的随机差异，逐像素回归因此在 SwiftShader 上做。
- **音乐**：场景里写的 `sfx: [[t, 'tone', {midi: 64}], ...]` 由页面汇总成 cue 表；`films/infotheory/score.py` 用 `audio/synth.py` 的乐器按场景写编曲（每小节一个毛毡钢琴和弦、四分音符琶音、弦乐铺底、大提琴根音；地平线页只有弦乐渐强和单音），再按 cue 表放置翻页、落笔、轻击、单音、小钟；混音后由 ffmpeg 两遍 loudnorm 做成 WAV 母版，并检查积分响度 −16 LUFS ±0.5、真峰值 ≤ −1.5 dBTP、时长等于影片。

## 成片记录

第一版（2026-09-28）用的是参考片的视觉语言：黑底星云、金色衬线、闪切与蒙太奇；使用者觉得与参考片太像，于是换成现在这套"纸与黎明"，内容保留。第一版母版保留在 `out/infotheory.mp4`，新版在 `out/infotheory_v2.mp4`。
