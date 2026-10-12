#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""U33 待拍板队列一页台 —— 只读解析步（呈现层之前那一步）。

一条命令（或双击同目录 U33_run_board.bat）做四件事：
  1) 只读扫描 docs\\comms 根目录里"等我点头"的文档（文件名带 待拍板/待用户确认/待用户终验/待后台执行 等字样）；
  2) 只读解析《待办-用户侧清单》§2/§3/§4 三张表里的逐条 U 系列事项（§1/§5 是已完成，自动剔除）；
  3) 与 docs\\comms\\README.md 手写的「待拍板/待执行/待终验」表交叉核对，把两边不一致的列出来（不判谁对）；
  4) 产出两份东西：U33_queue.json（给下游呈现层消费）与 U33_pending_board.html（能双击打开的一页台）。

边界（硬）：
  * 全程只读，不写被扫目录，不改任何正文，不宣称能收口；
  * 不代填建议值、不替你拍板；创意内容（措辞/审美/剧情）一律留空由你写；
  * 敏感串（IP、令牌、密钥值）落档前一律打码。

退出码：0 正常 / 2 写入目标越界 / 3 被扫目录不存在 / 4 一条都没解析出来
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys

# ---------------------------------------------------------------- 常量与正则

DEFAULT_COMMS = r"D:\Hermes Agent CN Desktop\workspace\artist-commission\docs\comms"
USER_LIST_GLOB = "待办-用户侧清单"
README_NAME = "README.md"

# 文件名自带的"等我点头"字样（口径：文件名，不读正文）
PENDING_NAME_RE = re.compile(r"待(拍板|用户确认|用户终验|后台执行|拍清单|办)")
# 正文状态行
STATUS_RE = re.compile(r"状态\s*[:：]\s*(.+?)\*?\*?\s*$")
# 日期三种写法：2026-08-24 / 2026/8/24 / 文件名里的 20260824
DATEDASH_RE = re.compile(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})")
DATECOMPACT_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")
# 销账勾
UNCHECKED_RE = re.compile(r"^\s*[-*]\s\[ \]")
CHECKED_RE = re.compile(r"^\s*[-*]\s\[[xX]\]")
# 呈"已处置却没改名"嫌疑的状态词
SETTLED_RE = re.compile(r"已拍板|已确认|已完成|已销|已归档")
# 条目级"等什么"列名优先级（照文档原列名取，不自己编）
WAIT_HEADER_PRIORITY = ("你要做什么", "要做什么", "议题")
# 该表没有上述列时，"等什么"退回抄段标题原话，用这个内部标记（不参与渲染文案）
NO_ASK_COL_MARK = "本段标题（该表无「你要做什么」列）"
# 段落标题里出现这些词才算"等你"段；出现这些词的段直接跳过
PEND_SECTION_RE = re.compile(r"等你|待拍|红灯|审文字")
DONE_SECTION_RE = re.compile(r"已完成|知道就好|不需你动作")
DONE_ROW_RE = re.compile(r"✅|已销|已完成|已落地并")

IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
TOKEN_RE = re.compile(r"\b(?:sk|ghp|gho|github_pat|xox[abpr])[-_][A-Za-z0-9]{8,}\b")
HEXLONG_RE = re.compile(r"\b[0-9a-fA-F]{24,}\b")
CREDURL_RE = re.compile(r"\b[a-zA-Z][\w+.-]*://[^\s/@:]+:[^\s@]+@")
SECRETEQ_RE = re.compile(r"(密钥|口令|密码|secret|token)\s*[:：=]\s*\S{4,}")

REASON_WORDS = ("待用户确认", "待复核", "待拍板", "待后台执行", "待用户终验", "待验", "未拍板", "待做",
                "需你", "等你", "请你", "需要你", "等你点头", "待你")

# 人话口径说明（写进 JSON / HTML 头部；只解释口径，不含任何建议值）
CALIBER = {
    "悬置天数": "悬置天数 = 今天 − 挂账起算日。文档级：起算日取正文「产出日期」，没有就取文件名里的 8 位日期，再没有取文件修改时间。条目级：起算日取该行明文里的日期——反引号里的路径、文件名、编号带的日期一律不采信（否则 `…-20260912.md` 里的日期会冒充挂账日）；行内没有可信日期就退回所属清单的立档日，并标 WARN 提示「新补的条目会被高估」。",
    "最后改动": "另一个锚点：文件 mtime 到今天的天数。它和悬置天数不一致（改动明显晚于挂账日）说明正文动过但没改名、没销账——本页据此标 WARN，不替你判断那件事是否已完。",
    "未销账默认态": "只要文件名还带「待」字、勾选项没打满，就按「还没完」呈现。判据不清一律 WARN，不判 FAIL、不判已完。",
    "等什么": "逐字取自文档自己的字段：状态行、README 挂账列、清单表里名为「你要做什么／议题／卡在哪／前置」的列。本页不生成建议、不填推荐值、不替你决定。",
    "收口": "本页不宣称能收口。表态只存在你这台机器的浏览器里（localStorage），可复制成文本；不回写任何文档，不产生文件。",
}

# ---------------------------------------------------------------- 小工具


def mask_sensitive(text: str) -> tuple[str, int]:
    """落档前打码：IP、令牌、带账号的 URL、密钥=值。返回 (文本, 命中数)。"""
    hits = 0

    def _sub(rx, repl, s, n):
        new, cnt = rx.subn(repl, s)
        return new, n + cnt

    text, hits = _sub(IPV4_RE, "〔IP已脱敏〕", text, hits)
    text, hits = _sub(CREDURL_RE, "〔带账号URL已脱敏〕", text, hits)
    text, hits = _sub(TOKEN_RE, "〔令牌已脱敏〕", text, hits)
    text, hits = _sub(HEXLONG_RE, "〔长串已脱敏〕", text, hits)
    text, hits = _sub(SECRETEQ_RE, r"〔\1值不落档〕", text, hits)
    return text, hits


def clean_inline(s: str) -> str:
    """只去 markdown 记号，不改一个字（保留反引号里的路径，方便你查）。"""
    s = re.sub(r"\*\*", "", s)
    s = s.replace("~~", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_date(y: str, m: str, d: str) -> dt.date | None:
    try:
        return dt.date(int(y), int(m), int(d))
    except ValueError:
        return None


def latest_date_in(text: str) -> dt.date | None:
    """文本里能找到的最晚日期（两种写法都认）。"""
    found = []
    for mt in DATEDASH_RE.finditer(text):
        dd = parse_date(*mt.groups())
        if dd:
            found.append(dd)
    for mt in DATECOMPACT_RE.finditer(text):
        dd = parse_date(*mt.groups())
        if dd:
            found.append(dd)
    return max(found) if found else None


def read_lines(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read().splitlines()


def split_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return parts


def is_sep_row(line: str) -> bool:
    return bool(re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", line)) and "-" in line


def strip_untrusted(text: str) -> str:
    """算日期锚点前，先把"不是挂账日期"的东西剔掉：反引号里的路径/编号、带斜杠的路径、文件名。
    不这么做，`docs/comms/xxx-20260912.md` 里的 20260912 会被当成这条事项的挂账日，天数就假了。"""
    t = re.sub(r"`[^`]*`", " ", text)
    t = re.sub(r"[\w.\-]*[\\/][\w.\-\\/]*", " ", t)
    t = re.sub(r"\b[\w.\-]+\.(?:md|ts|tsx|vue|json|py|ps1|mjs|cjs|bat|rpy)\b", " ", t)
    return t


def all_dates(text: str) -> list[str]:
    ds = []
    for mt in DATEDASH_RE.finditer(text):
        ds.append(mt.group(0))
    for mt in DATECOMPACT_RE.finditer(text):
        ds.append("-".join(mt.groups()))
    return sorted(set(ds))


def doc_entry_from_path(path: str, today: dt.date) -> dict:
    """机械抽取一份文档的"什么事/等什么/几个锚点天数"。"""
    name = os.path.basename(path)
    lines = read_lines(path)
    size = os.path.getsize(path)
    mtime = dt.date.fromtimestamp(os.path.getmtime(path))

    title = ""
    for ln in lines[:8]:
        if ln.startswith("# "):
            title = clean_inline(ln[2:])
            break
    if not title:
        title = name[:-3] if name.endswith(".md") else name

    status_line, status_at = "", 0
    for idx, ln in enumerate(lines[:20], start=1):
        m = STATUS_RE.search(clean_inline(ln.lstrip("> ")))
        if m:
            status_line, status_at = clean_inline(m.group(1)), idx
            break

    # 正文产出日期：只认"产出日期/立档/日期"后面紧跟的那个日期，不瞎猜
    body_date, body_date_at = None, 0
    head = "\n".join(lines[:20])
    for mm in re.finditer(r"(产出日期|立档|日期)\s*[:：]?\s*((?:20\d{2})[-/]?\d{1,2}[-/]?\d{1,2})", head):
        cand = latest_date_in(mm.group(2))
        if cand:
            body_date, body_date_at = cand, head[: mm.start()].count("\n") + 1
            break

    fname_date = None
    fm = DATECOMPACT_RE.search(name)
    if fm:
        fname_date = parse_date(*fm.groups())

    anchor = body_date or fname_date or mtime
    anchor_src = "正文产出日期" if body_date else ("文件名日期" if fname_date else "文件修改时间")

    unchecked = sum(1 for ln in lines if UNCHECKED_RE.match(ln))
    checked = sum(1 for ln in lines if CHECKED_RE.match(ln))

    # 没写「状态：」行的文档：等什么退回抄标题（标题自带待/未字样时），照样标出处行号
    status_from_title = False
    if not status_line and re.search(r"待|未拍板", title):
        status_line, status_at, status_from_title = title, 1, True

    # "等什么"补充：正文前 60 行里点到待的字样，逐字摘录（最多 3 条，带行号）
    asks = []
    for idx, ln in enumerate(lines[:60], start=1):
        txt = clean_inline(ln.lstrip("->#*| \t"))
        if not txt or len(txt) > 170 or idx == status_at or txt == title:
            continue
        if any(w in txt for w in REASON_WORDS) and not DONE_ROW_RE.search(txt):
            asks.append({"line": idx, "text": txt, "src": name})
        if len(asks) >= 3:
            break

    flags = []
    if status_from_title:
        flags.append({"level": "INFO", "code": "本文没有「状态：」行，「等什么」抄自标题原话", "detail": status_line})
    if status_line and SETTLED_RE.search(status_line):
        flags.append({"level": "WARN", "code": "状态行已带处置字样但文件名仍挂待", "detail": status_line})
    if (today - mtime).days < (today - anchor).days:
        flags.append({
            "level": "WARN",
            "code": "正文改动晚于挂账日（可能已口头处理却没改名）",
            "detail": f"挂账 {anchor.isoformat()} / 改动 {mtime.isoformat()}",
        })
    if unchecked:
        flags.append({"level": "INFO", "code": f"勾选项未打满 {checked}/{checked + unchecked}", "detail": "未勾的条目按未销账呈现"})
    if anchor is None:
        flags.append({"level": "WARN", "code": "取不到挂账起算日", "detail": "天数不可信，需人工确认"})

    masked, n = 0, 0
    status_line, n = mask_sensitive(status_line); masked += n
    title, n = mask_sensitive(title); masked += n
    for a in asks:
        a["text"], n = mask_sensitive(a["text"]); masked += n

    return {
        "kind": "doc",
        "id": name,
        "what": title,
        "status_line": status_line,
        "status_line_at": status_at,
        "status_from_title": status_from_title,
        "asks": asks,
        "anchor_date": anchor.isoformat() if anchor else "",
        "anchor_source": anchor_src,
        "mtime_date": mtime.isoformat(),
        "days_pending": (today - anchor).days if anchor else None,
        "days_since_edit": (today - mtime).days,
        "checkbox": {"unchecked": unchecked, "checked": checked},
        "bytes": size,
        "lines": len(lines),
        "origin": {"file": name, "path": path.replace("\\", "/"), "line": status_at or 1},
        "masked_spans": masked,
        "flags": flags,
    }


def parse_user_list(path: str, today: dt.date) -> tuple[list[dict], dict]:
    """解析《待办-用户侧清单》§2/§3/§4 的逐条 U 事项。"""
    lines = read_lines(path)
    name = os.path.basename(path)
    title = clean_inline(next((ln[2:] for ln in lines[:5] if ln.startswith("# ")), name))
    lm = re.search(r"（(20\d{2}-\d{2}-\d{2})", title) or DATECOMPACT_RE.search(name)
    filed_date = latest_date_in(lm.group(1) if lm else "") or dt.date.fromtimestamp(os.path.getmtime(path))

    section = None          # 当前 ## 段
    rows, dropped = [], []
    stats = {"sections_used": [], "sections_skipped": [], "rows_dropped": 0}

    in_table = False
    headers: list[str] = []
    for idx, raw in enumerate(lines, start=1):
        if raw.startswith("## "):
            section = clean_inline(raw[3:])
            in_table = False
            headers = []
            continue
        if not raw.lstrip().startswith("|"):
            in_table = False
            headers = []
            continue
        if is_sep_row(raw):
            continue
        cells = split_table_row(raw)
        if not in_table:
            # 表头行：只有落在"等你"段里才认
            if not section or DONE_SECTION_RE.search(section) or not PEND_SECTION_RE.search(section):
                continue
            headers = [clean_inline(c) for c in cells]
            in_table = True
            if section not in stats["sections_used"]:
                stats["sections_used"].append(section)
            continue
        if not headers or len(cells) < 2:
            continue
        if not section or DONE_SECTION_RE.search(section):
            continue

        uid = clean_inline(cells[0])
        what = clean_inline(cells[1]) if len(cells) > 1 else ""
        if not re.match(r"^[A-Za-z]{1,4}[-]?\d{1,3}$", uid):
            continue
        if DONE_ROW_RE.search(what) or what.startswith("已"):
            dropped.append({"id": uid, "what": what, "line": idx, "why": "该行自带已完成/✅ 字样"})
            continue

        # 等什么：按文档原列名取，优先"你要做什么"，其次"议题"
        wait, wait_col = "", ""
        extras = []
        for hi in range(2, min(len(cells), len(headers))):
            col, val = headers[hi], clean_inline(cells[hi]) if hi < len(cells) else ""
            if not val:
                continue
            if not wait_col and any(k in col for k in WAIT_HEADER_PRIORITY):
                wait, wait_col = val, col
            else:
                extras.append({"col": col, "text": val})
        if not wait_col:
            wait, wait_col = section, NO_ASK_COL_MARK

        rowtext = " ".join(cells)
        row_date = latest_date_in(strip_untrusted(rowtext))
        raw_hints = all_dates(rowtext)
        used_hints = all_dates(strip_untrusted(rowtext))
        anchor = row_date or filed_date
        if row_date:
            anchor_src = "该行明文日期（已剔掉路径里的日期）"
        else:
            anchor_src = f"清单立档日 {filed_date.isoformat()}"

        masked_total = 0
        wait, n = mask_sensitive(wait); masked_total += n
        what, n = mask_sensitive(what); masked_total += n
        for e in extras:
            e["text"], n = mask_sensitive(e["text"]); masked_total += n

        flags = []
        if not row_date:
            flags.append({"level": "WARN", "code": "条目内没有独立挂账日期，天数按清单立档日算（新补的条目会高估）", "detail": anchor_src})
        if raw_hints and not used_hints:
            flags.append({"level": "INFO", "code": "行内日期只出现在路径/代码段里，未采信为挂账日",
                          "detail": "、".join(raw_hints)})
        if wait_col == NO_ASK_COL_MARK:
            flags.append({"level": "INFO", "code": "本表无「你要做什么」列，「等什么」照抄本段标题原话", "detail": wait_col})

        rows.append({
            "kind": "item",
            "id": uid,
            "what": what,
            "wait": wait,
            "wait_column": wait_col,
            "extras": extras,
            "section": section,
            "anchor_date": anchor.isoformat(),
            "anchor_source": anchor_src,
            "date_hints_in_row": raw_hints,
            "date_hints_trusted": used_hints,
            "days_pending": (today - anchor).days,
            "origin": {"file": name, "path": path.replace("\\", "/"), "line": idx},
            "masked_spans": masked_total,
            "flags": flags,
        })

    stats["rows_dropped"] = len(dropped)
    stats["dropped_rows"] = dropped
    stats["filed_date"] = filed_date.isoformat()
    stats["list_title"] = title
    return rows, stats


def parse_readme_hang(path: str) -> dict:
    """读 docs/comms/README.md 手写的「待拍板/待执行/待终验」表：文件名 -> 挂账话。"""
    if not os.path.isfile(path):
        return {}
    lines = read_lines(path)
    in_sec = False
    headers: list[str] = []
    out = {}
    for idx, raw in enumerate(lines, start=1):
        if raw.startswith("## "):
            in_sec = bool(re.search(r"待拍板|待执行|待终验", clean_inline(raw[3:])))
            headers = []
            continue
        if not in_sec or not raw.lstrip().startswith("|") or is_sep_row(raw):
            continue
        cells = split_table_row(raw)
        if not headers:
            headers = [clean_inline(c) for c in cells]
            continue
        if not cells:
            continue
        fcell = cells[0].strip("`* ")
        base = os.path.basename(fcell)
        hang = clean_inline(cells[1]) if len(cells) > 1 else ""
        if base.endswith(".md") and hang:
            out[base] = {"hang": hang, "line": idx}
    return out


def cross_check(docs: list[dict], hang: dict) -> dict:
    """文件名口径 与 README 手写口径 的差集（不判谁对，只列）。"""
    fn = {d["id"] for d in docs}
    rd = set(hang)
    both = sorted(fn & rd)
    for d in docs:
        h = hang.get(d["id"])
        if h:
            d["readme_hang"] = h["hang"]
            d["readme_hang_line"] = h["line"]
    only_fn = sorted(fn - rd)
    only_rd = sorted(rd - fn)
    return {
        "both": [{"file": f, "hang": hang[f]["hang"], "line": hang[f]["line"]} for f in both],
        "only_filename_caliber": only_fn,
        "only_readme_caliber": only_rd,
        "note": "文件名口径 %d 条、README 手写口径 %d 条，重合 %d 条。README 多出的那份可能文件名不带「待」字；文件名口径多出的可能是总账/交接件（里面装的是逐条 U 事项，不是单件待拍）。本页并列展示，不判谁对。"
                  % (len(fn), len(rd), len(both)),
    }


# ---------------------------------------------------------------- HTML 一页台

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>U33 待拍板队列一页台 · __TODAY__</title>
<style>
:root{--bg:#f7f5f0;--card:#fffdf8;--ink:#2b2a26;--mut:#6f6a5f;--line:#e0dbd0;--red:#b3261e;--amb:#a26a00;--ok:#2f6f3e;--accent:#4a5a3a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
header{padding:18px 22px 12px;background:var(--card);border-bottom:2px solid var(--line)}
h1{margin:0 0 4px;font-size:22px}
.sub{color:var(--mut);font-size:13px}
main{max-width:1280px;margin:0 auto;padding:16px 22px 60px}
.note{background:#fff8e1;border:1px solid #e8d9a8;border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:13.5px}
.note b{color:var(--amb)}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px;min-width:132px}
.stat u{display:block;font-size:12px;color:var(--mut);text-decoration:none}
.stat b{font-size:20px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.bar input[type=search]{flex:1;min-width:220px;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:14px}
.bar label{font-size:13px;color:var(--mut)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th{background:#efeadf;text-align:left;padding:9px 10px;font-size:13px;border-bottom:1px solid var(--line);white-space:nowrap;position:sticky;top:0}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
tr:hover td{background:#fbf8f1}
td.days{font-size:19px;font-weight:700;white-space:nowrap;text-align:right}
.days.d30{color:var(--red)}.days.d10{color:var(--amb)}.days.d0{color:var(--ok)}
.days small{display:block;font-size:11px;font-weight:400;color:var(--mut)}
.what{font-weight:600}
.wait{color:#3d3a33}
.meta{font-size:12px;color:var(--mut);margin-top:4px}
.quote{font-size:12.5px;color:var(--mut);border-left:3px solid var(--line);padding-left:8px;margin:5px 0}
code{background:#efeade;padding:1px 4px;border-radius:3px;font-size:12px;font-family:Consolas,monospace}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--mut);margin-right:4px}
.tag.doc{background:#e7efe4;border-color:#cdddc7;color:#33512f}
.tag.item{background:#e6edf5;border-color:#c9d8e8;color:#2c4a68}
.tag.warn{background:#fdf1e0;border-color:#e6cfa1;color:#8a5a00}
.dec{display:flex;flex-direction:column;gap:3px;min-width:148px}
.dec label{font-size:12.5px;color:#4a463d;cursor:pointer;white-space:nowrap}
.dec input[type=radio]{margin:0 3px 0 0}
.dec textarea{width:100%;height:34px;font-size:12px;border:1px solid var(--line);border-radius:5px;padding:3px 5px;resize:vertical}
.mark{background:#eef7ee!important}
h2{font-size:17px;margin:26px 0 8px;border-left:4px solid var(--accent);padding-left:9px}
.xc{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;font-size:13.5px}
.xc ul{margin:4px 0 10px;padding-left:20px}
textarea.out{width:100%;height:190px;font:12.5px/1.5 Consolas,monospace;border:1px solid var(--line);border-radius:8px;padding:10px}
.btn{padding:7px 14px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:7px;font-size:13.5px;cursor:pointer}
.btn.ghost{background:transparent;color:var(--accent)}
footer{color:var(--mut);font-size:12.5px;margin-top:22px;border-top:1px solid var(--line);padding-top:10px}
@media print{.bar,.btn,footer .no{display:none}td.dec textarea{display:none}body{background:#fff}}
</style>
</head>
<body>
<header>
  <h1>待拍板队列 · 一页台</h1>
  <div class="sub">生成 __GEN__ ｜ 今天 __TODAY__ ｜ 数据源 __SOURCE__ ｜ 全程只读，8 份正文一个字节都没改</div>
</header>
<main>

<div class="note">
  <b>这页是什么</b>：把散在文档堆里"等你点头"的事收成一张表——每行只有 <b>什么事 / 我在等什么 / 拖了多少天 / 出处</b>，最后一列点一下就记下<b>你的</b>表态。<br>
  <b>这页不是什么</b>：不填建议值、不替你决定、不宣称能收口；<b>没有一列叫"建议"</b>，措辞与审美这类创意内容一律留给你。表态只写进本机浏览器（localStorage），<b>不回写任何文档、不生成文件</b>；要交回项目组就按下面"复制表态清单"贴过去。<br>
  <b>为什么有的行带 WARN</b>：文件名的"待"字与正文状态可能不同步（改了没改名、口头处理了没销账）——按工单口径，判据不清一律 <b>WARN，不判已完也不判失效</b>。
</div>

<div class="stats">__STATS__</div>

<div class="bar">
  <input type="search" id="q" placeholder="过滤：打编号（U17）、打事（改稿上限）、打文件名都行">
  <label><input type="checkbox" id="onlyopen"> 只看还没表态</label>
  <label><input type="checkbox" id="onlywarn"> 只看带 WARN</label>
  <select id="sort"><option value="days">按悬置天数（久的在前）</option><option value="kind">按类型（文档级在前）</option></select>
  <button class="btn ghost" id="reset">清掉所有表态</button>
</div>

<table id="tb">
<thead><tr>
  <th style="width:150px">编号 / 出处</th><th>什么事</th><th style="width:34%">我在等什么（逐字摘自原文）</th>
  <th style="width:96px">悬置<br>天数</th><th style="width:170px">我的表态</th>
</tr></thead>
<tbody>
__ROWS__
</tbody>
</table>
<div class="meta" id="shown"></div>

<h2>口径交叉核对（两套清单不一致的地方，照实列，不判谁对）</h2>
<div class="xc">__XCHECK__</div>

<h2>表态清单（只有你自己点出来的东西；复制了才是要交回的话）</h2>
<div class="bar"><button class="btn" id="copy">复制表态清单</button><span class="sub" id="cstat"></span></div>
<textarea class="out" id="out" readonly placeholder="点过右侧的表态（通过／打回改／继续挂／要补信息）才会在这里长出来；空着说明你还没表态——这页绝不替你填。"></textarea>

<h2>每行判据的口径（本页所有数字都按这个算）</h2>
<div class="xc">__CALIBER__</div>

<footer>
  U33 ｜ 单元 C-T08-01 ｜ 解析步产物（下游呈现层可直接吃 <code>U33_queue.json</code>）｜ 本页为纯静态文件，双击即开、离线可看、打印友好<span class="no">｜ 落档文本已做 IP/令牌/密钥值打码</span>
</footer>
</main>

<script>
var KEY='u33-board-v1';
var store={};try{store=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){store={}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}}
function decId(f,i){return f+'#'+i}
document.querySelectorAll('input[type=radio][name=dec]').forEach(function(r){
  var k=r.closest('tr').dataset.key;
  var s=store[k]||{};
  if(s.v===r.value)r.checked=true;
});
document.querySelectorAll('textarea.note-in').forEach(function(t){
  var k=t.closest('tr').dataset.key;var s=store[k]||{};
  if(s.n)t.value=s.n;
});
document.addEventListener('change',function(e){
  if(e.target.matches('input[type=radio][name=dec]')||e.target.matches('textarea.note-in')){
    var tr=e.target.closest('tr');if(!tr)return;var k=tr.dataset.key;var s=store[k]||{};
    if(e.target.matches('input[type=radio]'))s.v=e.target.value;else s.n=e.target.value;
    store[k]=s;save();tr.classList.toggle('mark',!!s.v);refresh();
  }
});
document.getElementById('reset').onclick=function(){if(confirm('清掉本机浏览器里记的所有表态？文档本来就没被动过。')){store={};save();document.querySelectorAll('input[type=radio]').forEach(function(r){r.checked=false});document.querySelectorAll('textarea.note-in').forEach(function(t){t.value=''});document.querySelectorAll('tr.mark').forEach(function(t){t.classList.remove('mark')});refresh()}};
function rows(){return Array.prototype.slice.call(document.querySelectorAll('#tb tbody tr'))}
function refresh(){
  var q=document.getElementById('q').value.trim().toLowerCase();
  var onlyOpen=document.getElementById('onlyopen').checked;
  var onlyWarn=document.getElementById('onlywarn').checked;
  var n=0,marked=0;
  rows().forEach(function(tr){
    var k=tr.dataset.key,s=store[k]||{};
    if(s.v)marked++;
    var ok=true;
    if(q&&tr.textContent.toLowerCase().indexOf(q)<0)ok=false;
    if(onlyOpen&&s.v)ok=false;
    if(onlyWarn&&tr.dataset.warn!=='1')ok=false;
    tr.style.display=ok?'':'none';if(ok)n++;
  });
  document.getElementById('shown').textContent='当前显示 '+n+' / 共 '+rows().length+' 条 ｜ 本机已表态 '+marked+' 条（未表态 '+ (rows().length-marked) +' 条）';
  document.getElementById('mstat')&&(document.getElementById('mstat').textContent=marked+' / '+rows().length);
  buildOut();
}
function buildOut(){
  var L=[];var t=document.getElementById('out');
  rows().forEach(function(tr){
    var k=tr.dataset.key,s=store[k]||{};if(!s.v)return;
    L.push(tr.dataset.uid+' | '+tr.dataset.what+' | 我的表态：'+s.v+(s.n?(' | 我的话：'+s.n):'')+' | 出处 '+tr.dataset.origin+' | 悬置'+tr.dataset.days+'天');
  });
  t.value=L.length?L.join('\\n'):'（还没有表态。这页不替你填。）';
}
document.getElementById('copy').onclick=function(){
  var t=document.getElementById('out');t.select();
  var st=document.getElementById('cstat');
  function done(){st.textContent='已复制 '+(t.value.split('\\n').length)+' 行——贴回 docs/comms 由你或主代理动手，本页不代写。'}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,function(){try{document.execCommand('copy');done()}catch(e){st.textContent='复制失败，请手选文本框内容复制'}})}
  else{try{document.execCommand('copy');done()}catch(e){st.textContent='复制失败，请手选文本框内容复制'}}
};
document.getElementById('q').oninput=refresh;
document.getElementById('onlyopen').onchange=refresh;
document.getElementById('onlywarn').onchange=refresh;
document.getElementById('sort').onchange=function(){
  var v=this.value;var tb=document.querySelector('#tb tbody');
  rows().sort(function(a,b){
    if(v==='kind'){var ka=a.dataset.kind===('doc')?0:1,kb=b.dataset.kind===('doc')?0:1;if(ka!==kb)return ka-kb}
    return (+b.dataset.days)-(+a.dataset.days);
  }).forEach(function(tr){tb.appendChild(tr)});
};
rows().forEach(function(tr){var k=tr.dataset.key;if(store[k]&&store[k].v)tr.classList.add('mark')});
refresh();
</script>
</body>
</html>
"""


def esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def render_flag_tags(flags: list[dict]) -> str:
    out = []
    for f in flags:
        lv = f.get("level", "INFO")
        cls = "warn" if lv == "WARN" else ""
        out.append(f'<span class="tag {cls}" title="{esc(f.get("detail", ""))}">{esc(lv)}·{esc(f["code"])}</span>')
    return " ".join(out)


def render_rows(items: list[dict]) -> str:
    trs = []
    for it in items:
        origin = it["origin"]
        oid = f'{origin["file"]}:L{origin["line"]}'
        days = it["days_pending"] if it["days_pending"] is not None else -1
        dcls = "d30" if days >= 30 else ("d10" if days >= 10 else "d0")
        key = f'{it["kind"]}|{it["id"]}'
        warn = "1" if any(f["level"] == "WARN" for f in it.get("flags", [])) else "0"

        if it["kind"] == "doc":
            wait_html = ""
            if it.get("status_line"):
                lab = "标题原话" if it.get("status_from_title") else "状态行"
                wait_html += f'<div class="wait">{lab}（原文 L{it["status_line_at"]}）：{esc(it["status_line"])}</div>'
            if it.get("readme_hang"):
                wait_html += f'<div class="quote">README 挂账列 L{it["readme_hang_line"]}：{esc(it["readme_hang"])}</div>'
            for a in it.get("asks", []):
                wait_html += f'<div class="quote">原文 L{a["line"]}：{esc(a["text"])}</div>'
            if not wait_html:
                wait_html = '<div class="wait">（没抽到「等什么」——本文不用「状态：」写法，正文前 60 行也没点待的字样。本页不替你编。）</div>'
            cb = it["checkbox"]
            if cb["unchecked"] or cb["checked"]:
                wait_html += (f'<div class="meta">销账勾：未勾 {cb["unchecked"]} ／ 已勾 {cb["checked"]}'
                              f'（未勾按"还没完"计）｜ 正文 {it["lines"]} 行 {it["bytes"]} 字节</div>')
            extra_meta = f'<div class="meta">最后改动 {esc(it["mtime_date"])}（距今 {it["days_since_edit"]} 天）｜ 起算口径：{esc(it["anchor_source"])}</div>'
        else:
            if it["wait_column"] == NO_ASK_COL_MARK:
                wait_html = f'<div class="wait">本表没有「你要做什么」列，照抄本段标题原话：{esc(it["wait"])}</div>'
            else:
                wait_html = f'<div class="wait">「{esc(it["wait_column"])}」列：{esc(it["wait"])}</div>'
            for e in it.get("extras", []):
                wait_html += f'<div class="quote">{esc(e["col"])}：{esc(e["text"])}</div>'
            wait_html += f'<div class="meta">出自段落：{esc(it["section"])}</div>'
            extra_meta = f'<div class="meta">起算口径：{esc(it["anchor_source"])}</div>'

        radios = []
        for v in ("通过", "打回改", "继续挂", "要补信息"):
            radios.append(f'<label><input type="radio" name="dec" value="{v}">{v}</label>')
        dec = f'<div class="dec">{"".join(radios)}<textarea class="note-in" placeholder="要写就写，空着也行（不替你填）"></textarea></div>'

        trs.append(
            f'<tr data-key="{esc(key)}" data-uid="{esc(it["id"])}" data-what="{esc(it["what"])}"'
            f' data-origin="{esc(oid)}" data-days="{days}" data-kind="{it["kind"]}" data-warn="{warn}">'
            f'<td><span class="tag {it["kind"]}">{"文档级" if it["kind"] == "doc" else "条目级"}</span>'
            f'<div class="what">{esc(it["id"])}</div><div class="meta"><code>{esc(oid)}</code></div>'
            f'<div class="meta">{render_flag_tags(it.get("flags", []))}</div></td>'
            f'<td><span class="what">{esc(it["what"])}</span></td>'
            f'<td>{wait_html}{extra_meta}</td>'
            f'<td class="days {dcls}">{days if days >= 0 else "?"}<small>天</small></td>'
            f'<td>{dec}</td></tr>'
        )
    return "\n".join(trs)


def render_stats(items: list[dict], meta: dict) -> str:
    n_doc = sum(1 for i in items if i["kind"] == "doc")
    n_item = sum(1 for i in items if i["kind"] == "item")
    days = [i["days_pending"] for i in items if i["days_pending"] is not None]
    oldest = max(days) if days else 0
    over30 = sum(1 for d in days if d >= 30)
    nwarn = sum(1 for i in items if any(f["level"] == "WARN" for f in i.get("flags", [])))
    cells = [
        ("等你点头的事", f"{len(items)}", f"文档级 {n_doc} + 条目级 {n_item}"),
        ("最长悬置", f"{oldest} 天", f"≥30 天的 {over30} 条"),
        ("WARN 需人工确认", f"{nwarn}", "改了没改名 / 无日期锚点"),
        ("被扫目录条目", f'{meta["comms_entries"]}', f'文件 {meta["comms_files"]} + 子目录 {meta["comms_dirs"]}'),
        ("落档打码", f'{meta["masked_total"]}', "IP / 令牌 / 密钥值"),
        ('已表态（本机）', '<span id="mstat">0</span>', "只存浏览器，不回写"),
    ]
    return "".join(f'<div class="stat"><u>{esc(k)}</u><b>{v}</b><u>{esc(s)}</u></div>' for k, v, s in cells)


def render_xcheck(xc: dict, items: list[dict]) -> str:
    def li(names):
        return "".join(f"<li><code>{esc(n)}</code></li>" for n in names) or "<li>（无）</li>"
    doc_ids = {i["id"]: i for i in items if i["kind"] == "doc"}
    both = "".join(
        f'<li><code>{esc(r["file"])}</code> — 挂账原话 L{r["line"]}：{esc(r["hang"])}'
        f'（本台起算 {doc_ids[r["file"]]["days_pending"]} 天）</li>'
        for r in xc["both"] if r["file"] in doc_ids
    )
    return (
        f'<div>两套口径各 8 条，重合 <b>{len(xc["both"])}</b> 条。{esc(xc["note"])}</div>'
        f'<div style="margin-top:8px"><b>两套都挂（已进台）</b><ul>{both}</ul></div>'
        f'<div><b>只有文件名口径挂（README 表没列）</b><ul>{li(xc["only_filename_caliber"])}</ul></div>'
        f'<div><b>只有 README 口径挂（文件名不带"待"字，本台补列如下）</b><ul>{li(xc["only_readme_caliber"])}</ul></div>'
        f'<div class="meta">README-only 的两份本台未展开成行（工单射程=文件名带"待"字的 8 份）；要收进来就加参数 <code>--also-readme</code>。</div>'
    )


def render_caliber() -> str:
    return "".join(f"<div><b>{esc(k)}</b>：{esc(v)}</div>" for k, v in CALIBER.items())


# ---------------------------------------------------------------- 主流程


def main(argv: list[str] | None = None) -> int:
    # Windows 控制台默认 GBK，输出里的全角符号会炸；先把 stdout 拉成 UTF-8（失败就算了）
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="U33 待拍板队列一页台（只读解析步）")
    ap.add_argument("--comms", default=DEFAULT_COMMS, help="被扫目录（只读），默认 docs\\comms")
    ap.add_argument("--out", default=os.path.dirname(os.path.abspath(__file__)), help="产物写入目录（只能写这一个）")
    ap.add_argument("--today", default=None, help="天数计算的「今天」，YYYY-MM-DD，默认系统日期")
    ap.add_argument("--also-readme", action="store_true", help="把 README 挂账表里文件名不带「待」字的文档也收进队列")
    ap.add_argument("--json-name", default="U33_queue.json")
    ap.add_argument("--html-name", default="U33_pending_board.html")
    args = ap.parse_args(argv)

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    comms = os.path.abspath(args.comms)
    outdir = os.path.abspath(args.out)

    if not os.path.isdir(comms):
        print(f"[FAIL] 被扫目录不存在：{comms}", file=sys.stderr)
        return 3
    # 写入领地护栏：产物目录若在被扫目录（或其上级项目树）之内 → 拒写，保证只读
    proj_root = os.path.abspath(os.path.join(comms, *[os.pardir] * 3))
    if outdir.startswith(comms) or (os.path.isdir(proj_root) and outdir.startswith(proj_root)):
        print(f"[FAIL] 写入目标越界（不许落在被扫项目树里）：{outdir}", file=sys.stderr)
        print(f"       只准写你自己的交付目录，例如 --out G:\\backup\\toolshop-2026-09-29\\out\\U33", file=sys.stderr)
        return 2
    os.makedirs(outdir, exist_ok=True)

    print(f"U33 待拍板队列解析 ｜ 今天 {today.isoformat()} ｜ 只读扫描 {comms}")

    # 1) 文档级队列
    docs, scanned = [], 0
    for entry in sorted(os.listdir(comms)):
        p = os.path.join(comms, entry)
        if not os.path.isfile(p) or not entry.lower().endswith(".md"):
            continue
        scanned += 1
        if PENDING_NAME_RE.search(entry):
            docs.append(doc_entry_from_path(p, today))
    n_entries = len(os.listdir(comms))
    n_files = sum(1 for e in os.listdir(comms) if os.path.isfile(os.path.join(comms, e)))
    n_dirs = n_entries - n_files
    print(f"  条目 {n_entries}（文件 {n_files} + 子目录 {n_dirs}）｜ 根目录 .md {scanned} 份｜文件名挂待 → {len(docs)} 份")

    # 2) 条目级队列
    items: list[dict] = []
    list_stats = {}
    ulist = None
    for d in docs:
        if USER_LIST_GLOB in d["id"]:
            ulist = os.path.join(comms, d["id"])
    if not ulist:
        cand = [f for f in os.listdir(comms) if USER_LIST_GLOB in f and f.endswith(".md")]
        ulist = os.path.join(comms, cand[0]) if cand else None
    if ulist:
        items, list_stats = parse_user_list(ulist, today)
        print(f"  用户侧清单 §2/§3/§4 逐条 → {len(items)} 条 U 事项（自动剔掉自带已完成字样的 {list_stats['rows_dropped']} 行）")
        for s in list_stats["sections_used"]:
            print(f"     · 取用段落：{s}")
    else:
        print("  [WARN] 找不到《待办-用户侧清单》，条目级队列为空")

    # 3) 交叉核对
    hang = parse_readme_hang(os.path.join(comms, README_NAME))
    xc = cross_check(docs, hang)
    # 三个来源都没抽到"等什么"→ 明告需人工确认，不判死也不替你编
    for d in docs:
        if not d.get("status_line") and not d.get("asks") and not d.get("readme_hang"):
            d["flags"].append({"level": "WARN", "code": "没抽到「等什么」，需人工确认", "detail": d["id"]})
    print(f"  README 手写挂账表 → {len(hang)} 行｜与文件名口径重合 {len(xc['both'])} 条")

    # 3b) 可选：把只有 README 口径挂着（文件名不带「待」字）的文档也收成行
    if args.also_readme:
        known = {d["id"] for d in docs}
        added = []
        for fname, info in sorted(hang.items()):
            if fname in known:
                continue
            p2 = os.path.join(comms, fname)
            if not os.path.isfile(p2):
                print(f"  [WARN] README 挂账表点到但不存在：{fname}")
                continue
            d2 = doc_entry_from_path(p2, today)
            d2["readme_hang"] = info["hang"]
            d2["readme_hang_line"] = info["line"]
            d2["flags"].append({"level": "INFO", "code": "文件名不带「待」字，按 README 挂账表收进队列",
                                "detail": f"README.md L{info['line']}"})
            docs.append(d2)
            added.append(fname)
        if added:
            print(f"  --also-readme 补收 {len(added)} 份：" + "、".join(added))

    queue = sorted(docs + items, key=lambda x: (x["kind"], -(x["days_pending"] or 0)))
    if not queue:
        print("[FAIL] 一条都没解析出来", file=sys.stderr)
        return 4

    masked_total = sum(i.get("masked_spans", 0) for i in queue)
    meta = {
        "unit": "U33 / C-T08-01",
        "today": today.isoformat(),
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "comms_dir": comms.replace("\\", "/"),
        "comms_entries": n_entries,
        "comms_files": n_files,
        "comms_dirs": n_dirs,
        "doc_caliber_count": len(docs),
        "item_caliber_count": len(items),
        "readme_hang_rows": len(hang),
        "masked_total": masked_total,
        "user_list_stats": list_stats,
        "readonly": True,
        "writes": [args.json_name, args.html_name],
    }
    payload = {"meta": meta, "caliber": CALIBER, "cross_check": xc, "items": queue}

    jpath = os.path.join(outdir, args.json_name)
    with open(jpath, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)

    html_text = (HTML_TEMPLATE
                 .replace("__TODAY__", today.isoformat())
                 .replace("__GEN__", meta["generated"])
                 .replace("__SOURCE__", esc(meta["comms_dir"]))
                 .replace("__STATS__", render_stats(queue, meta))
                 .replace("__ROWS__", render_rows(queue))
                 .replace("__XCHECK__", render_xcheck(xc, queue))
                 .replace("__CALIBER__", render_caliber()))
    hpath = os.path.join(outdir, args.html_name)
    with open(hpath, "w", encoding="utf-8-sig", newline="\n") as fh:
        fh.write(html_text)

    # 控制台结论
    print("\n最挂账的 8 条（悬置天数从多到少）：")
    top = sorted([i for i in queue if i["days_pending"] is not None], key=lambda x: -x["days_pending"])[:8]
    for i in top:
        print(f"  {i['days_pending']:>3} 天 ｜ {i['id'][:34]:<34} ｜ {i['what'][:34]}")
    warns = [i for i in queue if any(f["level"] == "WARN" for f in i.get("flags", []))]
    print(f"\nWARN 需人工确认 {len(warns)} 条：")
    for i in warns[:12]:
        codes = "；".join(f["code"] for f in i["flags"] if f["level"] == "WARN")
        print(f"  · {i['id'][:30]:<30} {codes}")
    if masked_total:
        print(f"\n落档打码命中 {masked_total} 处（IP/令牌/密钥值样式）。")
    print(f"\n产物：\n  {jpath}\n  {hpath}  ← 双击这个就是一页台")
    print("只读保证：未对被扫目录做任何写/改/删；本台不代填建议值、不宣称收口。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
