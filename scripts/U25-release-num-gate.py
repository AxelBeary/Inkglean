#!/usr/bin/env python3
# -- coding: utf-8 --
"""U25 发版数字自检（单元 C-T07-03）——版本号与迁移号三源比对闸门。

一句话：发版前敲一条命令，把"各份文档里写的数字是不是同一个"点清楚，
只报不改，不动任何生产文件。

比对口径（全部写进输出，便于对账；改口径请同步 README.md 第三节）：
  A 版本号（语义化 X.Y.Z）
     - 权威源：server/package.json、web/package.json、根 package.json 的 `version` 字段
       （根 package.json 若没有该字段 → 记 WARN 不参与比对，缺失不等于数字不一致）
     - 对照源：docs/comms/STATUS.md 顶部看板（只读到第一个"下一步"之前）、
       docs/changelog.md 活档顶部第一个 `## vX.Y.Z 发版记录` 标题（顶插纪律 → 最新发布版）
     - 独立车道：desktop/package.json、shared/package.json、desktop/docs/STATUS.md
       只展示不比对（桌面端与内部包各走自己的号）
  B 迁移号（vNN）
     - 唯一事实源＝磁盘：server/src/db/migrations/ 下 `vNN-*.ts` 的最大序号
       （裁判修正后的做法：文档一律不认）
     - 链路权威：同目录 index.ts 的 `import { migration as vNN }` 行 + 数组项 `vNN,` 行
     - 对照源：docs/CONTEXT.md 的"迁移当前 **vNN**"、docs/comms/STATUS.md 看板的"迁移 **vNN**"
     - 排除：docs/comms/archive*/、docs/changelog-archive/、AGENTS/temp/、node_modules/、
       worktrees/、docs/changelog.md 正文里的历史迁移号（台账只记历史，不作当前声明）
  C 测试数：本件**不判**（已由 scripts/accept-baseline.json + scripts/check-test-tamper.mjs 覆盖）

退出码：0 = 无 FAIL（可发版，WARN 只提示不阻塞）；1 = 有 FAIL（需动手）；2 = 事实源定位失败。
用法：python U25-release-num-gate.py [--root 仓库根] [--json] [--strict] [--selftest]
"""

import argparse
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = r"D:\Hermes Agent CN Desktop\workspace\artist-commission"

SEMVER = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?"
MIG_FILE_RE = re.compile(r"^v(\d{1,3})-.+\.ts$")
MIG_IMPORT_RE = re.compile(r"import\s*\{\s*migration as v(\d{1,3})\s*\}")
MIG_ENTRY_RE = re.compile(r"^\s*v(\d{1,3}),\s*$")
STATUS_BOARD_LIMIT = 40          # 看板最多读这么多行（超过则只取"下一步"之前）
CHANGELOG_SCAN_LINES = 400       # 活档体积门 ≤450 行，这里扫前 400 行找最新发布版标题
# 口径排除面（写进输出的 INFO 行）：docs/comms/archive*、docs/changelog-archive、
# AGENTS/temp、node_modules、worktrees —— 台账与归档里的历史数字不作"当前声明"比对。

LEVEL_ORDER = {"INFO": 0, "PASS": 1, "WARN": 2, "FAIL": 3}


def read_text(path):
    """读文本并记录用到的编码；中文注释吃掉下一行的坑与此无关（那是 .ps1 的）。"""
    with open(path, "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8(replace)"


def board_lines(path, limit=STATUS_BOARD_LIMIT):
    """取 STATUS 看板块：文件开头到第一个含"下一步"的行（不含）为止，硬上限 limit 行。"""
    text, enc = read_text(path)
    lines = text.splitlines()
    out, used = [], len(lines)
    for i, line in enumerate(lines):
        if i >= limit:
            used = i
            break
        if i > 0 and "下一步" in line:
            used = i
            break
        out.append((i + 1, line))
    return out, enc, used


class Report(object):
    def __init__(self):
        self.rows = []      # dict: 轴/来源/口径命中值/角色/位置/级别/说明
        self.actions = []   # 需动手清单

    def add(self, axis, source, value, role, where, level, note):
        self.rows.append({"axis": axis, "source": source, "value": value, "role": role,
                          "where": where, "level": level, "note": note})
        if level in ("FAIL", "WARN"):
            self.actions.append("[%s] %s %s —— %s（%s）" % (level, axis, source, note, where))

    @property
    def worst(self):
        w = "PASS"
        for r in self.rows:
            if LEVEL_ORDER[r["level"]] > LEVEL_ORDER[w]:
                w = r["level"]
        return w


# ---------------------------------------------------------------- 版本号

def collect_versions(root, rep):
    truth = {}   # lane -> (value, where)
    # 1) 三份 package.json（权威）
    for lane, rel in (("server", "server/package.json"),
                      ("web", "web/package.json"),
                      ("root", "package.json")):
        p = os.path.join(root, rel.replace("/", os.sep))
        if not os.path.exists(p):
            rep.add("版本号", rel, "—", "权威源", rel, "FAIL", "文件不存在，权威源缺一，比对基准不足")
            continue
        try:
            data = json.loads(read_text(p)[0])
        except Exception as exc:
            rep.add("版本号", rel, "—", "权威源", rel, "FAIL", "JSON 解析失败：%s" % exc)
            continue
        ver = data.get("version")
        if ver is None:
            rep.add("版本号", rel, "无 version 字段", "权威源", rel + "（顶层键：%s）"
                    % ",".join(sorted(data.keys())[:6]), "WARN",
                    "该包未声明 version 字段，按口径不参与一致性比对（缺失≠不一致），要不要补由负责人拍板")
            continue
        if not re.fullmatch(SEMVER, str(ver)):
            rep.add("版本号", rel, str(ver), "权威源", rel, "WARN", "写法不是 X.Y.Z，未纳入比对")
            continue
        truth[lane] = (str(ver), "%s → version" % rel)
        rep.add("版本号", rel, str(ver), "权威源", "%s → version" % rel, "PASS", "已解析")

    # 2) 对照源：docs/comms/STATUS.md 看板
    status_path = os.path.join(root, "docs", "comms", "STATUS.md")
    doc_claims = []
    if os.path.exists(status_path):
        bl, enc, used = board_lines(status_path)
        for lane, pat in (("server", re.compile(r"server[^0-9\n]{0,12}?" + "(" + SEMVER + ")")),
                          ("web", re.compile(r"web[^0-9\n]{0,12}?" + "(" + SEMVER + ")")),
                          ("desktop", re.compile(r"(?:桌面|desktop)[^0-9\n]{0,12}?" + "(" + SEMVER + ")"))):
            hits = []
            for lineno, line in bl:
                for m in pat.finditer(line):
                    hits.append((lineno, m.group(1)))
            uniq = sorted({v for _, v in hits})
            if not uniq:
                if lane != "desktop":
                    rep.add("版本号", "docs/comms/STATUS.md 看板", "未命中", "对照源",
                            "看板前 %d 行（编码 %s）" % (used, enc), "WARN",
                            "看板里没抓到该端的版本号写法，比对未闭环（可能措辞变了），别当成一致")
                continue
            if len(uniq) > 1:
                rep.add("版本号", "docs/comms/STATUS.md 看板（%s）" % lane, "|".join(uniq), "对照源",
                        "行 %s" % ",".join(str(n) for n, _ in hits), "WARN",
                        "同一看板里该端抓到多个不同版本号，口径歧义")
                continue
            lineno, val = hits[0]
            where = "docs/comms/STATUS.md:%d" % lineno
            doc_claims.append((lane, val, where))
            rep.add("版本号", "docs/comms/STATUS.md 看板（%s）" % lane, val, "对照源", where,
                    "INFO", "看板抓取（只读前 %d 行）" % used)
    else:
        rep.add("版本号", "docs/comms/STATUS.md", "文件不存在", "对照源", status_path, "WARN",
                "主状态文档不在预期位置，版本对照缺一源")

    # 3) 对照源：docs/changelog.md 顶部第一个发版记录标题
    cl_path = os.path.join(root, "docs", "changelog.md")
    if os.path.exists(cl_path):
        text, enc = read_text(cl_path)
        lines = text.splitlines()[:CHANGELOG_SCAN_LINES]
        hit = None
        for i, line in enumerate(lines):
            m = re.match(r"^##\s+v?(" + SEMVER + r")\s+发版记录", line)
            if m:
                hit = (i + 1, m.group(1))
                break
        if hit:
            doc_claims.append(("server", hit[1], "docs/changelog.md:%d" % hit[0]))
            doc_claims.append(("web", hit[1], "docs/changelog.md:%d" % hit[0]))
            rep.add("版本号", "docs/changelog.md 首个发版记录", hit[1], "对照源",
                    "docs/changelog.md:%d" % hit[0], "INFO",
                    "顶插纪律下首个发版记录＝最新发布版；只取前 %d 行内首个匹配" % CHANGELOG_SCAN_LINES)
        else:
            rep.add("版本号", "docs/changelog.md 首个发版记录", "未命中", "对照源",
                    "前 %d 行" % CHANGELOG_SCAN_LINES, "WARN",
                    "没找到 `## vX.Y.Z 发版记录` 标题（可能最新段落是未发布批次），别当成一致")
    else:
        rep.add("版本号", "docs/changelog.md", "文件不存在", "对照源", cl_path, "WARN", "变更史不在预期位置")

    # 4) 独立车道：desktop / shared 各走自己的号，不参与主线判定，只做车道内对照
    lane_truth = {k: v for k, v in truth.items() if k in ("server", "web", "root")}
    indep = {}
    for lane, rel in (("desktop", "desktop/package.json"), ("shared", "shared/package.json")):
        p = os.path.join(root, rel.replace("/", os.sep))
        if not os.path.exists(p):
            continue
        try:
            v = json.loads(read_text(p)[0]).get("version")
        except Exception:
            v = None
        if v is None:
            rep.add("版本号", "%s（独立车道）" % rel, "无 version 字段", "不比对", rel, "INFO",
                    "内部包未声明版本，仅登记不判定")
            continue
        indep[lane] = (str(v), "%s → version" % rel)
        rep.add("版本号", "%s（独立车道）" % rel, str(v), "不比对", rel, "INFO",
                "桌面端/内部包各走自己的号，口径排除在主比对之外")

    # 5) 一致性判定
    vals = sorted({v for v, _ in lane_truth.values()})
    if len(vals) > 1:
        rep.add("版本号", "权威源互检", "|".join(vals), "判定",
                "; ".join("%s=%s" % (k, lane_truth[k][0]) for k in sorted(lane_truth)), "FAIL",
                "package.json 之间版本号不一致：本次发版没同步齐")
    elif len(vals) == 1:
        rep.add("版本号", "权威源互检", vals[0], "判定",
                "; ".join("%s=%s" % (k, lane_truth[k][0]) for k in sorted(lane_truth)), "PASS",
                "package.json 之间一致")
    else:
        rep.add("版本号", "权威源互检", "—", "判定", "无可用权威源", "FAIL",
                "一个版本号权威源都没拿到，闸门无法给出结论")

    for lane, val, where in doc_claims:
        if lane in indep:                      # 独立车道：齐了记 INFO，不齐最多 WARN，不阻塞主线
            base = indep[lane]
            ok = (val == base[0])
            rep.add("版本号（独立车道）", "文档对照（%s）" % lane, val, "判定", where,
                    "INFO" if ok else "WARN",
                    "与 %s 一致" % base[1] if ok else
                    "文档写 %s，%s 是 %s——独立车道，不阻塞主线，供参考" % (val, base[1], base[0]))
            continue
        base = lane_truth.get(lane)
        if base is None:
            rep.add("版本号", "文档对照（%s）" % os.path.basename(where.split(":")[0]), val, "判定",
                    where, "WARN", "该端没有权威版本号可比，跳过（不算一致也不算不一致）")
            continue
        ok = (val == base[0])
        rep.add("版本号", "文档对照（%s）" % lane, val, "判定", where,
                "PASS" if ok else "FAIL",
                "与权威 %s（%s）一致" % (base[0], base[1]) if ok else
                "文档写的 %s 落后/超前于权威 %s（%s）——正是本卡要拦的病" % (val, base[0], base[1]))
    return truth


# ---------------------------------------------------------------- 迁移号

def collect_migrations(root, rep):
    mig_dir = os.path.join(root, "server", "src", "db", "migrations")
    disk = {}
    if not os.path.isdir(mig_dir):
        rep.add("迁移号", "server/src/db/migrations", "目录不存在", "权威源", mig_dir, "FAIL",
                "唯一事实源目录找不到，闸门无法给出结论")
        return None
    for fn in sorted(os.listdir(mig_dir)):
        m = MIG_FILE_RE.match(fn)
        if m:
            disk[int(m.group(1))] = fn
    if not disk:
        rep.add("迁移号", "server/src/db/migrations", "0 个 vNN-*.ts", "权威源", mig_dir, "FAIL",
                "目录里没有形如 vNN-name.ts 的迁移文件")
        return None
    max_v = max(disk)
    rep.add("迁移号", "磁盘最大序号（唯一事实源）", "v%d" % max_v, "权威源",
            "口径：`v(\\d{1,3})-*.ts` 取最大，目录内共 %d 个文件、命中 %d 个（index.ts/types.ts 不计）"
            % (len(os.listdir(mig_dir)), len(disk)), "PASS", "本次比对的基准值")

    # 链路：index.ts
    idx_path = os.path.join(mig_dir, "index.ts")
    registered = set()
    if os.path.exists(idx_path):
        text, enc = read_text(idx_path)
        for line in text.splitlines():
            for rx in (MIG_IMPORT_RE, MIG_ENTRY_RE):
                m = rx.match(line.strip()) or rx.search(line)
                if m:
                    registered.add(int(m.group(1)))
                    break
        missing = sorted(set(disk) - registered)
        ghost = sorted(registered - set(disk))
        reg_max = max(registered) if registered else None
        rep.add("迁移号", "index.ts 注册链", "v%s" % (reg_max if reg_max is not None else "—"),
                "链路权威", "index.ts（编码 %s，命中 %d 个序号）" % (enc, len(registered)),
                "PASS" if not missing and not ghost else "FAIL",
                "链与磁盘一致" if not missing and not ghost else
                "有文件没挂进链：%s / 链里引用了不存在的文件：%s"
                % (["v%d" % v for v in missing], ["v%d" % v for v in ghost]))
    else:
        rep.add("迁移号", "index.ts", "文件不存在", "链路权威", idx_path, "FAIL",
                "迁移链入口缺失")

    # 文档对照
    for rel, rx, label in ((os.path.join("docs", "CONTEXT.md"),
                            re.compile(r"迁移(?:当前|号)?\s*\**v?(\d{1,3})\**"), "CONTEXT.md"),
                            (os.path.join("docs", "comms", "STATUS.md"),
                            re.compile(r"迁移(?:当前|号)?\s*\**v?(\d{1,3})\**"), "STATUS.md 看板")):
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            rep.add("迁移号", label, "文件不存在", "对照源", rel, "WARN", "对照源缺档")
            continue
        hits = []
        if label.startswith("STATUS"):
            scope = board_lines(p)[0]
        else:
            scope = [(i + 1, l) for i, l in enumerate(read_text(p)[0].splitlines())]
        for lineno, line in scope:
            for m in rx.finditer(line):
                hits.append((lineno, int(m.group(1))))
        if not hits:
            rep.add("迁移号", label, "未命中", "对照源", "%s（看板前 %s 行）" % (rel, len(scope)),
                    "WARN", "没抓到「当前/迁移 vNN」式声明，该文档不在这次比对里（别当成一致）")
            continue
        uniq = sorted({v for _, v in hits})
        if len(uniq) > 1:
            rep.add("迁移号", label, "|".join("v%d" % v for v in uniq), "对照源",
                    "%s 行 %s" % (rel, ",".join(str(n) for n, _ in hits)), "WARN",
                    "同一文档抓到多个迁移号，口径歧义")
            continue
        v = uniq[0]
        where = "%s:%d" % (rel, hits[0][0])
        ok = (v == max_v)
        rep.add("迁移号", label, "v%d" % v, "判定", where, "PASS" if ok else "FAIL",
                "与磁盘一致" if ok else
                "文档写 v%d，磁盘实际 v%d（%s）——文档以磁盘为准，该改的是文档"
                % (v, max_v, disk[max_v]))

    # 排除面说明（防"为什么没报历史数字"疑问）
    arch = [d for d in os.listdir(os.path.join(root, "docs")) if "changelog-archive" in d]
    comms = os.path.join(root, "docs", "comms")
    n_arch = 0
    if os.path.isdir(comms):
        n_arch = sum(1 for d in os.listdir(comms) if d.startswith("archive"))
    rep.add("迁移号", "口径排除面", "—", "说明",
            "docs/comms/archive*（%d 个归档块）、docs/%s、AGENTS/temp、node_modules、worktrees"
            % (n_arch, arch[0] if arch else "changelog-archive"), "INFO",
            "归档与台账正文里的历史迁移号（如 v38/v65/v68）不参与比对，否则会假红")
    return max_v


# ---------------------------------------------------------------- 输出

def render_table(rep):
    cols = ("轴", "来源", "口径命中值", "角色", "位置", "级别", "说明")
    widths = [6, 26, 16, 10, 34, 4, 46]
    out = []
    out.append("| " + " | ".join(cols) + " |")
    out.append("|" + "|".join("---" for _ in cols) + "|")
    for r in rep.rows:
        cells = [r["axis"], r["source"], r["value"], r["role"], r["where"], r["level"], r["note"]]
        cells = [str(c).replace("|", "/").replace("\n", " ") for c in cells]
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out), cols, widths


def main(argv=None):
    ap = argparse.ArgumentParser(description="U25 发版数字自检：版本号与迁移号三源比对闸门（只报不改）")
    ap.add_argument("--root", default=DEFAULT_ROOT, help="仓库根（默认：%s）" % DEFAULT_ROOT)
    ap.add_argument("--json", action="store_true", help="额外输出机器可读 JSON")
    ap.add_argument("--strict", action="store_true", help="WARN 也算不过（退出码 1）")
    ap.add_argument("--selftest", action="store_true", help="对内置夹具跑一遍，验证 FAIL 分支真能触发")
    args = ap.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if args.selftest:
        return selftest(args)

    root = os.path.abspath(args.root)
    print("U25 发版数字自检 ｜ 仓库根：%s" % root)
    if not os.path.isdir(root):
        print("致命：仓库根不存在，退出码 2。")
        return 2
    if not os.path.isdir(os.path.join(root, "server", "src", "db", "migrations")):
        print("致命：server/src/db/migrations 不在，事实源定位失败，退出码 2。")
        return 2

    rep = Report()
    collect_versions(root, rep)
    collect_migrations(root, rep)
    worst = rep.worst

    table, cols, _ = render_table(rep)
    print()
    print("## 比对表（级别：FAIL=数字不齐 / WARN=口径未闭环，提示不阻塞 / PASS=一致 / INFO=说明）")
    print()
    print(table)

    n_fail = sum(1 for r in rep.rows if r["level"] == "FAIL")
    n_warn = sum(1 for r in rep.rows if r["level"] == "WARN")
    n_pass = sum(1 for r in rep.rows if r["level"] == "PASS")
    print()
    print("## 结论")
    print("- 计数：PASS %d ｜ WARN %d ｜ FAIL %d" % (n_pass, n_warn, n_fail))
    if rep.actions:
        print("- 要动手的（本件只出清单，不替你改）：")
        for a in rep.actions:
            print("  - %s" % a)
    if n_fail:
        print("- 判定：❌ 需动手——有 %d 项 FAIL，先齐数字再发版。" % n_fail)
    elif n_warn:
        print("- 判定：🟡 数字之间没有硬冲突，但有 %d 项 WARN（口径未闭环），建议顺手补。" % n_warn)
    else:
        print("- 判定：✅ 可发版——版本号与迁移号在各源里是同一个数。")
    print("- 测试数不在本件口径内（已由 scripts/accept-baseline.json + scripts/check-test-tamper.mjs 覆盖）。")

    if args.json:
        print()
        print("## JSON")
        print(json.dumps({"root": root, "worst": worst, "fail": n_fail, "warn": n_warn,
                          "rows": rep.rows, "actions": rep.actions}, ensure_ascii=False, indent=2))

    if n_fail:
        return 1
    if args.strict and n_warn:
        return 1
    return 0


# ---------------------------------------------------------------- 夹具自测

def selftest(args):
    fx = os.path.join(HERE, "自测夹具")
    cases = [("pass", os.path.join(fx, "pass"), 0), ("fail", os.path.join(fx, "fail"), 1)]
    print("U25 自测（夹具在 %s）" % fx)
    bad = 0
    for name, path, expect in cases:
        if not os.path.isdir(path):
            print("- %s：夹具缺失，无法自测" % name)
            bad += 1
            continue
        buf = io.StringIO()
        real = sys.stdout
        sys.stdout = buf
        try:
            rc = main(["--root", path])
        finally:
            sys.stdout = real
        ok = (rc == expect)
        print("- 夹具 %-5s 期望退出码 %d，实得 %d → %s" % (name, expect, rc, "OK" if ok else "不符"))
        if not ok:
            bad += 1
            print(buf.getvalue())
    print("自测结论：%s" % ("全部符合预期（FAIL 分支确实能触发，不是假绿）" if bad == 0
                            else "有 %d 个夹具结果不符，闸门本身可疑" % bad))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
