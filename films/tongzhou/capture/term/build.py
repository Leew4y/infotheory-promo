"""Build the terminal replays for the film's terminal scenes (听懂, 人改单, 账单) from REAL command output.

The .txt / .md files next to this script are the verbatim stdout of the product's commands, run on the product
repository (1010-ai-hackathon) — re-run them on the frozen main before the final capture and copy the output here:

    understand.txt      uv run --env-file .env python -m citydelivery.assistant ask --tl 10 \
                          "19号店今天关门；另外26号店改成8点到10点收货" "有辆车今天不能用"
                        (LLM_BASE_URL / LLM_MODEL as in .env.example; real model, DeepSeek, thinking on)
    replan-legal.md     make replan-demo  ->  replan-output/legal/report.md
    replan-invalid.md   make replan-demo  ->  replan-output/invalid/report.md
    bills.txt           make owner-bills LLM=1

The replay only selects lines (never edits them) and paces them to the narration; lines left out are marked with a
「…」 line. Commands really take longer (solving, model calls), so every page carries a 「已加速」 tag.

    python films/tongzhou/capture/term/build.py     ->  understand.html, replan.html, bills.html
"""
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return f.read().splitlines()


def pick(lines, pattern, n=1):
    """The first line matching `pattern` and the n-1 lines after it; fails loudly if the output changed."""
    for i, s in enumerate(lines):
        if re.search(pattern, s):
            return lines[i:i + n]
    raise SystemExit(f'pattern not found: {pattern!r}')


def row(lines, label):
    return pick(lines, r'^\| ' + re.escape(label) + r' \|')[0]


SKIP = '…'


def understand():
    out = read('understand.txt')
    msg1 = pick(out, r'^## 消息：19号店')[0]
    model1 = pick(out, r'^模型输出：\{"kind": "requests"')[0]
    applied = pick(out, r'^应用的改动：', 3)
    table = pick(out, r'^\| 指标', 2) + [row(out, l) for l in ('总成本(元)', '车辆数', '总里程(km)', '晚到站数', '装不下的路线', '未送门店', '装载校验违规')]
    verdict = pick(out, r'^结论：')[0]
    msg2 = pick(out, r'^## 消息：有辆车')[0]
    model2 = pick(out, r'^模型输出：\{"kind": "needs_clarification"')[0]
    ask = pick(out, r'^需要补充信息：')[0]
    cmd = 'uv run --env-file .env python -m citydelivery.assistant ask --tl 10 "19号店今天关门；另外26号店改成8点到10点收货" "有辆车今天不能用"'
    return [
        (300, 'cmd', cmd),
        (2300, 'out', pick(out, r'^种子 1：改动前方案')[0]),
        (2900, 'head', msg1),
        (3500, 'hl', model1),
        (4300, 'out', applied[0]), (4400, 'out', applied[1]), (4500, 'out', applied[2]),
        *[(5100 + 90 * i, 'tbl', s) for i, s in enumerate(table)],
        (6200, 'dim', SKIP),
        (6600, 'ok', verdict),
        (9600, 'head', msg2),
        (10300, 'hl', model2),
        (11000, 'ok', ask),
    ], 16500


def replan():
    legal, bad = read('replan-legal.md'), read('replan-invalid.md')
    rows = ('成本（元）', '用车数', '里程（km）', '晚到门店数', '未服务门店数')
    return [
        (300, 'cmd', 'make replan-demo'),
        (1200, 'dim', '# 合法改单：同一辆车里调换两家相邻门店的先后（replan-output/legal-changes.json）'),
        (1500, 'cmd', 'cat replan-output/legal/report.md'),
        (2000, 'head', pick(legal, r'^# 人工改单检查')[0]),
        (2300, 'ok', pick(legal, r'^可执行')[0]),
        (2700, 'tbl', pick(legal, r'^\| 指标')[0]), (2750, 'tbl', pick(legal, r'^\|---')[0]),
        *[(2850 + 100 * i, 'tbl', row(legal, l)) for i, l in enumerate(rows)],
        (6400, 'dim', '# 非法改单：删掉 1 号路线这辆车（replan-output/invalid-changes.json）'),
        (6700, 'cmd', 'cat replan-output/invalid/report.md'),
        (7200, 'head', pick(bad, r'^# 人工改单检查')[0]),
        (7500, 'bad', pick(bad, r'^不可执行')[0]),
        (7900, 'tbl', pick(bad, r'^\| 指标')[0]), (7950, 'tbl', pick(bad, r'^\|---')[0]),
        *[(8050 + 100 * i, 'tbl', row(bad, l)) for i, l in enumerate(rows)],
        (9000, 'out', pick(bad, r'^新方案不合格')[0]),
    ], 14500


def bills():
    out = read('bills.txt')
    head = pick(out, r'^## 连锁药店', 6)
    note = pick(out, r'^说明（大模型）：本账单对应连锁药店')[0]
    return [
        (300, 'cmd', 'make owner-bills LLM=1'),
        (1000, 'out', pick(out, r'^实例 1（30 家门店')[0]),
        (1400, 'dim', SKIP),
        *[(1800 + 120 * i, 'head' if i == 0 else 'out', s) for i, s in enumerate(head)],
        (2800, 'hl', note),
    ], 7500


PAGE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{title}</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #FFFFFF; }}
  body {{ font: 22px/1.55 "Cascadia Mono", Consolas, "Microsoft YaHei UI", "Microsoft YaHei", monospace; color: #1D1D1F;
         padding: 26px 40px; box-sizing: border-box; overflow: hidden; }}
  #log {{ white-space: pre-wrap; word-break: break-all; }}
  .line {{ min-height: 1.55em; }}
  .cmd::before {{ content: "$ "; color: #4F3BD6; font-weight: 700; }}
  .cmd {{ font-weight: 600; }}
  .head {{ font-weight: 700; margin-top: .35em; }}
  .hl {{ color: #4F3BD6; font-weight: 600; }}
  .ok {{ color: #1F7A35; font-weight: 700; }}
  .bad {{ color: #C4281C; font-weight: 700; }}
  .dim {{ color: #6E6E73; }}
  .tbl {{ color: #3A3A3C; }}
  .caret {{ display: inline-block; width: .6em; background: #1D1D1F; animation: b 1s steps(1) infinite; }}
  @keyframes b {{ 50% {{ opacity: 0; }} }}
  #tag {{ position: fixed; right: 0; top: 0; padding: 12px 24px 8px 16px; background: #FFFFFF; font-size: 17px; color: #6E6E73; }}
</style></head>
<body><div id="tag">已加速 · 模拟数据</div><div id="log"></div>
<script>
const STEPS = {steps};
const log = document.getElementById('log');
const t0 = performance.now();
let i = 0, typing = null;
function add(cls, text) {{ const d = document.createElement('div'); d.className = 'line ' + cls; d.textContent = text; log.appendChild(d); return d; }}
function frame() {{
  const t = performance.now() - t0;
  while (i < STEPS.length && STEPS[i][0] <= t) {{
    const [at, cls, text] = STEPS[i++];
    if (cls === 'cmd') typing = {{ el: add('cmd', ''), text, at }};
    else add(cls, text);
  }}
  if (typing) {{
    const n = Math.min(typing.text.length, Math.floor((t - typing.at) / 14));
    typing.el.textContent = typing.text.slice(0, n);
    if (n >= typing.text.length) typing = null;
  }}
  const over = log.scrollHeight - (window.innerHeight - 52);
  log.style.transform = over > 0 ? `translateY(${{-over}}px)` : '';
  requestAnimationFrame(frame);
}}
requestAnimationFrame(frame);
</script></body></html>
"""

SCENARIO = """// Terminal replay of real command output for the {id} scene (built by capture/term/build.py; the page paces itself).
//   python films/tongzhou/capture/term/build.py
//   bun scripts/capture.ts --film tongzhou --id term-{id} films/tongzhou/capture/term-{id}.ts
// (a Scenario, scripts/lib/scenario.ts; films may not import scripts, so the type is not named here)
import {{ pathToFileURL }} from 'node:url';
import path from 'node:path';

export default {{
  url: pathToFileURL(path.resolve('films/tongzhou/capture/term/{id}.html')).href,
  viewport: {{ width: 1600, height: 672 }},
  async run(act: any) {{ // act: scripts/lib/scenario.ts Act
    await act.wait({total});
  }},
}};
"""

for name, fn in (('understand', understand), ('replan', replan), ('bills', bills)):
    steps, total = fn()
    with open(os.path.join(HERE, f'{name}.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(PAGE.format(title=html.escape(name), steps=json.dumps(steps, ensure_ascii=False)))
    with open(os.path.join(os.path.dirname(HERE), f'term-{name}.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(SCENARIO.format(id=name, total=total))
    print(f'{name}: {len(steps)} steps, {total / 1000:.1f} s')
