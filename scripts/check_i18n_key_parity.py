#!/usr/bin/env python3
"""校验 i18n 键算法的两处实现是否仍然一致（app.js ↔ scripts/merge_i18n.py）。

为什么需要它
------------
覆盖层按「提示词内容」挂载，键算法在前端（app.js）和后端（merge_i18n.py）各写了一份，
两边必须逐字等价。任何一边改了、另一边没跟上，译文就会**静默失联**——
不报错、不崩溃，只是页面上看不到翻译。历史上全靠注释里一句「必须与…一致」提醒，
等于没有保障。这个脚本把那句注释变成 CI 里的硬检查。

做法：不复制算法，而是从 app.js 里**原样抽走**那两段源码交给 node 执行，
再和 merge_i18n.py 的实现对同一批提示词比对结果。

用法：
  python3 scripts/check_i18n_key_parity.py          # 人工跑
  （CI 在 pages.yml 的 validate 步骤里跑，不一致即失败）

依赖：需要 node（GitHub Actions 的 ubuntu-latest 自带）。
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
DATA = ROOT / "data" / "styles.json"

sys.path.insert(0, str(ROOT / "scripts"))
import merge_i18n  # noqa: E402


def grab(lines, first_marker, end_pred):
    """从 app.js 里截取一段源码：从含 first_marker 的行开始，到 end_pred 为真那行结束。"""
    start = next((i for i, l in enumerate(lines) if first_marker in l), None)
    if start is None:
        raise SystemExit(f"app.js 里找不到 {first_marker!r}，算法是不是改名了？")
    end = None
    for i in range(start, len(lines)):
        if end_pred(lines[i]):
            end = i
            break
    if end is None:
        raise SystemExit(f"app.js 里 {first_marker!r} 那段的结束位置没找到")
    return "\n".join(lines[start:end + 1])


def main() -> int:
    lines = APP.read_text(encoding="utf-8").splitlines()
    key_js = grab(lines, "const normPrompt", lambda l: "const i18nKeyShort" in l)
    cn_js = grab(lines, "const MJ_PARAM", lambda l: l.strip() == "}")

    assets = json.loads(DATA.read_text(encoding="utf-8"))["assets"]
    prompts = [str(a.get("prompt") or "") for a in assets]

    tmp = ROOT / ".i18n-parity-input.json"
    tmp.write_text(json.dumps(prompts, ensure_ascii=False), encoding="utf-8")
    runner = f"""
const fs = require("fs");
{key_js}
{cn_js}
const ps = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(JSON.stringify(ps.map((p) => [i18nKey(p), i18nKeyShort(p), isCN(p)])));
"""
    script = ROOT / ".i18n-parity-run.cjs"
    script.write_text(runner, encoding="utf-8")
    try:
        proc = subprocess.run(["node", str(script), str(tmp)],
                              capture_output=True, text=True, encoding="utf-8")
        if proc.returncode != 0:
            print("node 执行失败：", proc.stderr[:400], file=sys.stderr)
            return 1
        js_out = json.loads(proc.stdout)
    finally:
        tmp.unlink(missing_ok=True)
        script.unlink(missing_ok=True)

    bad = []
    for a, p, js in zip(assets, prompts, js_out):
        py = [merge_i18n.i18n_key(p), merge_i18n.i18n_key_short(p), merge_i18n.is_cn(p)]
        if js != py:
            bad.append((a.get("id"), js, py))

    print(f"比对 {len(assets)} 条提示词：主键 / 副键 / 语种判定")
    if bad:
        print(f"✗ {len(bad)} 条不一致 —— 两处算法已经漂移，译文会静默失联：")
        for sid, js, py in bad[:5]:
            print(f"   {sid}  app.js={js}  merge_i18n.py={py}")
        return 1
    print("✓ app.js 与 merge_i18n.py 的键算法完全一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
