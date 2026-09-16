#!/usr/bin/env python3
"""新增一条风格：压图 + 生成缩略图 + 写入 data/styles.json。

用法:
  python3 scripts/add_style.py \\
    --image ~/Downloads/demo.png \\
    --title "默片拼贴海报" \\
    --category "海报排版——模板" \\
    --model "Midjourney" \\
    --prompt-file ./prompt.txt \\
    --tags "海报,拼贴,竖图"

多步工作流条目（多图 + 每步提示词一对一）:
  python3 scripts/add_style.py \\
    --image step1.png --prompt-file step1.txt \\
    --title "赛博朋克左轮（三步工作流）" \\
    --category "游戏——科幻武器道具" \\
    --shot-image step2.png --shot-label "步骤② UE5写实重绘" --shot-prompt-file step2.txt \\
    --shot-image step3.png --shot-label "步骤③ 三视图展开" --shot-prompt-file step3.txt

  --shot-image / --shot-label / --shot-prompt-file 可重复，与主图一起构成
  shots 数组（主图 = 步骤①，prompt 必填；label 缺省自动编号「步骤N」）。
  每张图的 prompt 存进 shots[i].prompt，详情页「分步提示词」区一对一展示。

  --dry-run 只打印将写入的内容，不改文件。
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
FULL = ROOT / "assets" / "full"
THUMB = ROOT / "assets" / "thumb"
MAX_FULL = 1400
MAX_THUMB = 520


def next_id(assets):
    nums = [int(re.sub(r"\D", "", a["id"]) or 0) for a in assets]
    n = max(nums, default=0) + 1
    return f"A{n:03d}", f"{n:03d}"


def compress(src, full_path, thumb_path):
    im = Image.open(src).convert("RGB")
    f = im.copy()
    f.thumbnail((MAX_FULL, MAX_FULL), Image.LANCZOS)
    f.save(full_path, "WEBP", quality=82, method=6)
    t = im.copy()
    t.thumbnail((MAX_THUMB, MAX_THUMB), Image.LANCZOS)
    t.save(thumb_path, "WEBP", quality=72, method=6)
    return f.width, f.height


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--category", required=True)
    ap.add_argument("--model", default="通用")
    ap.add_argument("--kind", default="")
    ap.add_argument("--tone", default="")
    ap.add_argument("--palette", default="")
    ap.add_argument("--tags", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--prompt-file", default="")
    ap.add_argument("--shot-image", action="append", default=[],
                    help="追加示例图（可重复），与主图组成 shots")
    ap.add_argument("--shot-label", action="append", default=[],
                    help="对应示例图的步骤名（可重复，缺省自动「步骤N」）")
    ap.add_argument("--shot-prompt-file", action="append", default=[],
                    help="对应示例图那一步的完整提示词文件（可重复，主图缺省用 --prompt）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    prompt = args.prompt
    if args.prompt_file:
        prompt = Path(args.prompt_file).read_text(encoding="utf-8").strip()
    if not prompt:
        raise SystemExit("需要 --prompt 或 --prompt-file")

    n_img = len(args.shot_image)
    n_lab = len(args.shot_label)
    n_pmt = len(args.shot_prompt_file)
    if n_pmt not in (0, n_img):
        raise SystemExit(
            f"--shot-prompt-file 数量须为 0（全部继承主提示词）或 {n_img}（与 --shot-image 一一对应）：当前 {n_pmt}")
    if n_lab > n_img:
        raise SystemExit(f"--shot-label 数量不能多于 --shot-image：{n_lab} > {n_img}")

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    assets = payload["assets"]
    aid, seq = next_id(assets)

    if args.dry_run:
        print(f"[dry-run] 将新增 {aid} 「{args.title}」 分类={args.category} kind={args.kind or '(tags[0])'}")
        print(f"[dry-run] 主图 {args.image} → assets/full/{aid}.webp")
        for i, (si, sp) in enumerate(zip(args.shot_image, args.shot_prompt_file), start=2):
            lab = args.shot_label[i - 2] if i - 2 < n_lab else f"步骤{chr(9312 + i - 1)}"
            print(f"[dry-run] shot{i} {si} → assets/full/{aid}-{i}.webp | {lab} | prompt={sp or '(继承主提示词)'}")
        return

    FULL.mkdir(parents=True, exist_ok=True)
    THUMB.mkdir(parents=True, exist_ok=True)

    w, h = compress(args.image, FULL / f"{aid}.webp", THUMB / f"{aid}.webp")
    shots = [{
        "img": f"assets/full/{aid}.webp",
        "thumb": f"assets/thumb/{aid}.webp",
        "w": w, "h": h,
        "prompt": prompt,
    }]
    if n_img:
        shots[0]["label"] = "步骤①"
    for i in range(n_img):
        lw, lh = compress(args.shot_image[i],
                          FULL / f"{aid}-{i + 2}.webp", THUMB / f"{aid}-{i + 2}.webp")
        shot = {
            "img": f"assets/full/{aid}-{i + 2}.webp",
            "thumb": f"assets/thumb/{aid}-{i + 2}.webp",
            "w": lw, "h": lh,
            "label": args.shot_label[i] if i < n_lab else f"步骤{chr(0x2460 + i + 1)}",
            "prompt": (Path(args.shot_prompt_file[i]).read_text(encoding="utf-8").strip()
                       if i < n_pmt else prompt),
        }
        shots.append(shot)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    aspect = "方图" if 0.9 <= w / h <= 1.1 else ("横图" if w > h else "竖图")
    entry = {
        "id": aid,
        "seq": seq,
        "title": args.title,
        "category": args.category,
        "kind": args.kind or (tags[0] if tags else args.category),
        "tone": args.tone,
        "palette": args.palette,
        "model": args.model,
        "tags": tags or [args.category],
        "aspect": aspect,
        "hot": 60,
        "updated": date.today().strftime("%Y.%m.%d"),
        "note": args.note,
        "prompt": prompt,
        "img": f"assets/full/{aid}.webp",
        "thumb": f"assets/thumb/{aid}.webp",
        "w": w,
        "h": h,
    }
    if len(shots) > 1:
        entry["shots"] = shots
    assets.append(entry)

    counts = {}
    for a in assets:
        counts[a["category"]] = counts.get(a["category"], 0) + 1
    known = {c["name"] for c in payload["cats"]}
    for c in payload["cats"]:
        c["count"] = counts.get(c["name"], 0)
    if args.category not in known:
        payload["cats"].append({"name": args.category, "tone": "NEW CATEGORY", "count": counts[args.category]})
    payload["count"] = len(assets)

    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    n_steps = len(shots)
    extra = f"（含 {n_steps} 步示例图/提示词）" if n_steps > 1 else ""
    print(f"✓ 已添加 {aid} 「{args.title}」（共 {len(assets)} 条）{extra}")


if __name__ == "__main__":
    main()
