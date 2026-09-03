import json, math, csv, statistics, datetime as dt
from collections import defaultdict
import openpyxl

import os
ROOT = os.environ.get("XP_ROOT", "C:/Users/Caio/Documents/Documentos/XP")
AN = f"{ROOT}/tmp/earnings_regimes_analysis"
OUT = f"{ROOT}/outputs/01a06328-b1e5-7e72-a850-3d4674c9b127"
KEYS = ["EU_JD", "ED_JD", "EU_JU", "ED_JU"]

# ---------- 1. EPS ----------
wb = openpyxl.load_workbook(f"{ROOT}/Ibovespa Best EPS.xlsx", read_only=True, data_only=True)
eps_rows = [(r[0].date().isoformat(), float(r[1])) for r in wb["Sheet1"].iter_rows(min_row=2, values_only=True)
            if r[0] is not None and r[1] is not None and float(r[1]) > 0]
eps_rows.sort()
eps_dates = [d for d, _ in eps_rows]
print("EPS rows", len(eps_rows), eps_rows[0][0], eps_rows[-1][0], "dups", len(eps_dates) - len(set(eps_dates)))
flat = sum(1 for i in range(1, len(eps_rows)) if eps_rows[i][1] == eps_rows[i - 1][1])
print("EPS flat days (no change)", flat)
ch = [(eps_rows[i][0], eps_rows[i][1] / eps_rows[i - 1][1] - 1) for i in range(1, len(eps_rows))]
absch = sorted(abs(c) for _, c in ch)
q = lambda p: absch[int(p * (len(absch) - 1))]
print("abs daily change median %.4f p95 %.4f p99 %.4f" % (q(.5), q(.95), q(.99)))
print("largest changes", sorted(ch, key=lambda x: -abs(x[1]))[:4])
wk = defaultdict(int)
for d in eps_dates:
    wk[dt.date.fromisoformat(d).weekday()] += 1
print("EPS weekday distribution", dict(wk))

# ---------- 2. IBOV ----------
ibov = []
with open(f"{AN}/ibov_daily_long.csv", newline="") as f:
    for r in csv.DictReader(f):
        ibov.append((r["data"], float(r["ibov_close"]), r["source"]))
ibov.sort()
idates = [d for d, _, _ in ibov]
print("IBOV rows", len(ibov), ibov[0][0], ibov[-1][0], "dups", len(idates) - len(set(idates)))
for i in range(1, len(ibov)):
    if ibov[i][2] != ibov[i - 1][2]:
        a, b = ibov[i - 1], ibov[i]
        print("splice", a, "->", b, "simple ret %.4f log ret %.4f" % (b[1] / a[1] - 1, math.log(b[1] / a[1])))
gaps = [(idates[i - 1], idates[i]) for i in range(1, len(idates)) if (dt.date.fromisoformat(idates[i]) - dt.date.fromisoformat(idates[i - 1])).days > 5]
print("IBOV calendar gaps >5 days", gaps)
b3 = {}
with open(f"{ROOT}/assimetry_score/outputs/corporate/in_sample_cdi_strategy_search/ibov_daily_b3.csv", newline="") as f:
    for r in csv.DictReader(f):
        b3[r["data"]] = float(r["ibov_close"])
mism = [(d, p, b3.get(d)) for d, p, s in ibov if s == "B3 input series" and b3.get(d) != p]
print("B3 rows", len(b3), "mismatches vs long csv", len(mism), "B3-only dates not in long", len(set(b3) - set(idates)))
bcb_last = [r for r in ibov if r[2].startswith("BCB")][-1]
print("BCB last", bcb_last, "B3 first", [r for r in ibov if r[2].startswith("B3")][0])

# ---------- 3. as-of join, compare with dailyAudit ----------
raw = json.load(open(f"{AN}/deep_audit_analysis.json", encoding="utf8"))
da = raw["dailyAudit"]
base = []
p = -1
for d, price, src in ibov:
    while p + 1 < len(eps_rows) and eps_rows[p + 1][0] <= d:
        p += 1
    if p < 0:
        continue
    base.append(dict(date=d, price=price, src=src, eps=eps_rows[p][1], epsDate=eps_rows[p][0]))
print("aligned rows (mine)", len(base), base[0]["date"], base[-1]["date"], "dailyAudit rows", len(da))
diff = 0
for a, b in zip(base, da):
    if a["date"] != b["date"][:10] or abs(a["price"] - float(b["price"])) > 1e-9 or abs(a["eps"] - float(b["eps"])) > 1e-9 or a["epsDate"] != b["epsDate"][:10]:
        diff += 1
        if diff < 5:
            print("  diff", a, b)
print("dailyAudit vs my join mismatches:", diff)
print("rows where eps carried forward from earlier date:", sum(1 for r in base if r["date"] != r["epsDate"]))
print("EPS dates without IBOV trading day:", len(set(eps_dates) - set(idates)), " IBOV dates (>=2006) without same-day EPS:", sum(1 for d in idates if d >= "2006-01-02" and d not in set(eps_dates)))

# ---------- 4. rates ----------
rate = {}
with open(f"{ROOT}/swap_pre_di_regimes.csv", encoding="utf-8-sig", newline="") as f:
    for line in f.read().strip().split("\n")[1:]:
        fl = line.strip().split(";")
        rate[fl[0]] = 1 if fl[4] == "Hike" else 0 if fl[4] == "Cut" else None

# ---------- 5. IPCA ----------
ipca = {}
for fn in ["ipca_2006_2015.json", "ipca_2016_2025.json", "ipca_2026.json"]:
    for r in json.load(open(f"{AN}/ipca/{fn}")):
        dd, mm, yy = r["data"].split("/")
        ipca[f"{yy}-{mm}"] = float(r["valor"]) / 100


def slope(vals):
    n = len(vals)
    xm = (n - 1) / 2
    ym = sum(vals) / n
    num = sum((i - xm) * (v - ym) for i, v in enumerate(vals))
    den = sum((i - xm) ** 2 for i in range(n))
    return num / den


def make_events(valid, field):
    ev = []
    s = 0
    for i in range(1, len(valid) + 1):
        if i == len(valid) or valid[i][field] != valid[s][field]:
            cur = i == len(valid)
            end = valid[i - 1]["date"] if cur else valid[i]["date"]
            dur = (dt.date.fromisoformat(end) - dt.date.fromisoformat(valid[s]["date"])).days
            ev.append(dict(regime=valid[s][field], start=valid[s]["date"], end=end, dur=dur, td=i - s, cur=cur))
            s = i
    return ev


def run(window=63, confirm=2, rate_override_from="2025-05-07", rate_override_to=None, ipca_last="2026-07", threshold=0.0):
    rows = base
    n = len(rows)
    logeps = [math.log(r["eps"]) for r in rows]
    sl = [None] * n
    for i in range(window - 1, n):
        sl[i] = slope(logeps[i - window + 1:i + 1])
    monthEnds = []
    for i in range(n):
        m = rows[i]["date"][:7]
        nm = rows[i + 1]["date"][:7] if i + 1 < n else None
        if m != nm and sl[i] is not None:
            monthEnds.append((i, rows[i]["date"], 1 if sl[i] > threshold else 0))
    changes = []
    state = None
    pend = None
    pc = 0
    for i, d, s in monthEnds:
        if state is None:
            state = s
            if i + 1 < n:
                changes.append(dict(signalDate=d, effectiveDate=rows[i + 1]["date"], regime=s, init=True))
            continue
        if s == state:
            pend = None
            pc = 0
            continue
        if pend == s:
            pc += 1
        else:
            pend = s
            pc = 1
        if pc >= confirm and i + 1 < n:
            state = s
            changes.append(dict(signalDate=d, effectiveDate=rows[i + 1]["date"], regime=s, init=False))
            pend = None
            pc = 0
    eff = {c["effectiveDate"]: c["regime"] for c in changes}
    reg = [None] * n
    act = None
    for i in range(n):
        if rows[i]["date"] in eff:
            act = eff[rows[i]["date"]]
        reg[i] = act
    valid = []
    dropped = []
    for i in range(n):
        d = rows[i]["date"]
        if rate_override_from and d >= rate_override_from and (rate_override_to is None or d < rate_override_to):
            rt = 0
        else:
            rt = rate.get(d)
        if reg[i] is None or rt is None:
            if reg[i] is not None:
                dropped.append((d, rate.get(d, "absent")))
            continue
        valid.append(dict(date=d, price=rows[i]["price"], e=reg[i], r=rt, key=f"{'EU' if reg[i] else 'ED'}_{'JU' if rt else 'JD'}"))
    comb = make_events(valid, "key")
    ee = make_events(valid, "e")
    re_ = make_events(valid, "r")
    cal = defaultdict(int)
    for e in comb:
        cal[e["regime"]] += e["dur"]
    tot = sum(cal.values())
    ecal = defaultdict(int)
    for e in ee:
        ecal[e["regime"]] += e["dur"]
    mi = defaultdict(int)
    for i in range(len(valid) - 1):
        m = valid[i]["date"][:7]
        if m <= ipca_last and m in ipca:
            mi[m] += 1
    ret = {k: dict(n=0, nl=0.0, rl=0.0, pos=0, daily=[], dailyreal=[]) for k in KEYS}
    for i in range(len(valid) - 1):
        m = valid[i]["date"][:7]
        if m > ipca_last or m not in ipca:
            continue
        nl = math.log(valid[i + 1]["price"] / valid[i]["price"])
        infl = math.log1p(ipca[m]) / mi[m]
        b = ret[valid[i]["key"]]
        b["n"] += 1
        b["nl"] += nl
        b["rl"] += nl - infl
        b["pos"] += nl > 0
        b["daily"].append(nl)
        b["dailyreal"].append(nl - infl)
    for k, b in ret.items():
        b["nomA"] = math.expm1(b["nl"] * 252 / b["n"]) if b["n"] else None
        b["realA"] = math.expm1(b["rl"] * 252 / b["n"]) if b["n"] else None
    durs = sorted(e["dur"] for e in comb)
    return dict(valid=valid, dropped=dropped, comb=comb, ee=ee, re=re_, cal=cal, tot=tot, shares={k: cal[k] / tot for k in cal},
                ecal=ecal, ret=ret, changes=changes, monthEnds=monthEnds, nEvE=len(ee), nEvC=len(comb),
                le30=sum(1 for e in comb if e["dur"] <= 30), med=durs[len(durs) // 2], med_stat=statistics.median(durs), mi=mi)


R = run()
print("\n===== FINAL RULE REPRODUCTION =====")
print("classified rows", len(R["valid"]), R["valid"][0]["date"], R["valid"][-1]["date"])
print("dropped rows (regime defined but no rate):", R["dropped"])
print("month-end signals", len(R["monthEnds"]), "last month-end used:", R["monthEnds"][-1])
print("effective changes", len(R["changes"]))
J = json.load(open(f"{OUT}/earnings_rates_regime_summary.json", encoding="utf8"))
jc = J["earningsEffectiveChanges"]
same = len(jc) == len(R["changes"]) and all(a["signalDate"] == b["signalDate"] and a["effectiveDate"] == b["effectiveDate"] and a["regime"] == b["regime"] for a, b in zip(jc, R["changes"]))
print("effective changes identical to JSON:", same)
print("earnings events", R["nEvE"], "combined", R["nEvC"], "<=30d", R["le30"], "median(floor idx)", R["med"], "median(stat)", R["med_stat"])
print("calendar days", dict(R["cal"]), "total", R["tot"])
print("shares", {k: round(v * 100, 2) for k, v in R["shares"].items()})
et = sum(R["ecal"].values())
print("earnings shares (1=Up)", {k: round(v / et * 100, 2) for k, v in R["ecal"].items()})
rc = defaultdict(int)
for e in R["re"]:
    rc[e["regime"]] += e["dur"]
print("rates shares (1=Up)", {k: round(v / R["tot"] * 100, 2) for k, v in rc.items()})
for k in KEYS:
    b = R["ret"][k]
    print(f"{k}: n={b['n']} nomA={b['nomA'] * 100:.2f}% realA={b['realA'] * 100:.2f}% pos={b['pos'] / b['n'] * 100:.2f}%  | JSON n={J['returns'][k]['n']} nomA={J['returns'][k]['nominalAnnualized'] * 100:.2f}% realA={J['returns'][k]['realAnnualized'] * 100:.2f}%")
print("event counts per quadrant", {k: sum(1 for e in R["comb"] if e["regime"] == k) for k in KEYS})
print("current:", R["ee"][-1], R["re"][-1], R["comb"][-1])
je = J["events"]
sameE = len(je) == len(R["comb"]) and all(a["start"] == b["start"] and a["end"] == b["end"] and a["duration"] == b["dur"] and a["regime"] == b["regime"] and a["tradingDays"] == b["td"] for a, b in zip(je, R["comb"]))
print("combined events identical to JSON:", sameE)
aug = [v for v in R["valid"] if v["date"][:7] == "2026-08"]
print("Aug-2026 rows in valid:", len(aug), "| intervals used in returns =", sum(b["n"] for b in R["ret"].values()), "| total intervals =", len(R["valid"]) - 1)
print("July-2026 intervals counted:", R["mi"].get("2026-07"), "April-2006 intervals:", R["mi"].get("2006-04"))
print("first change", R["changes"][0])
# regime at month end vs next day (lag check) on a switch date
sw = R["changes"][-1]
vi = {v["date"]: i for i, v in enumerate(R["valid"])}
i = vi[sw["effectiveDate"]]
print("lag check around last switch:", [(R["valid"][j]["date"], R["valid"][j]["key"]) for j in range(i - 2, i + 2)])
# rate transitions used vs raw file
print("rate events (used):", [(e["regime"], e["start"]) for e in R["re"]])


# ---------- statistics ----------
def welch(a, b):
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    va, vb = statistics.variance(a), statistics.variance(b)
    se = math.sqrt(va / len(a) + vb / len(b))
    t = (ma - mb) / se
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(t) / math.sqrt(2))))
    return t, p, (ma - mb) * 252


print("\n===== STATISTICS =====")
r = R["ret"]
for lab, a, b in [("JD: EU vs ED", r["EU_JD"], r["ED_JD"]), ("JU: EU vs ED", r["EU_JU"], r["ED_JU"]), ("EU: JD vs JU", r["EU_JD"], r["EU_JU"]), ("ED: JD vs JU", r["ED_JD"], r["ED_JU"])]:
    t, p, diff = welch(a["daily"], b["daily"])
    t2, p2, _ = welch(a["dailyreal"], b["dailyreal"])
    print(f"Welch {lab}: nominal t={t:.2f} p={p:.3f} (arith ann diff {diff * 100:.1f}pp) | real t={t2:.2f} p={p2:.3f}")
EU = r["EU_JD"]["dailyreal"] + r["EU_JU"]["dailyreal"]
ED = r["ED_JD"]["dailyreal"] + r["ED_JU"]["dailyreal"]
print("Unconditional real annualized: EU %.1f%% (n=%d) ED %.1f%% (n=%d)" % (math.expm1(sum(EU) * 252 / len(EU)) * 100, len(EU), math.expm1(sum(ED) * 252 / len(ED)) * 100, len(ED)))
t, p, _ = welch(EU, ED)
print(f"Welch EU vs ED real: t={t:.2f} p={p:.3f}")
JD = r["EU_JD"]["dailyreal"] + r["ED_JD"]["dailyreal"]
JU = r["EU_JU"]["dailyreal"] + r["ED_JU"]["dailyreal"]
print("Unconditional real annualized: JD %.1f%% (n=%d) JU %.1f%% (n=%d)" % (math.expm1(sum(JD) * 252 / len(JD)) * 100, len(JD), math.expm1(sum(JU) * 252 / len(JU)) * 100, len(JU)))
t, p, _ = welch(JD, JU)
print(f"Welch JD vs JU real: t={t:.2f} p={p:.3f}")

# episode-level stats
valid = R["valid"]
mi = R["mi"]
es = defaultdict(list)
for e in R["comb"]:
    s = vi[e["start"]]
    t_ = vi[e["end"]] if not e["cur"] else len(valid) - 1
    rl = 0.0
    n = 0
    for i in range(s, t_):
        m = valid[i]["date"][:7]
        if m > "2026-07":
            continue
        rl += math.log(valid[i + 1]["price"] / valid[i]["price"]) - math.log1p(ipca[m]) / mi[m]
        n += 1
    if n:
        es[e["regime"]].append((e["start"], n, math.expm1(rl * 252 / n), rl))
for k in KEYS:
    v = [x[2] for x in es[k]]
    print(f"episode-level {k}: n_ep={len(v)} median annualized real={statistics.median(v) * 100:.1f}% episodes with positive total real log={sum(1 for x in es[k] if x[3] > 0)}/{len(v)}")
    print("    ", [(x[0], round(x[3] * 100, 1)) for x in es[k]])


# ---------- subsamples ----------
def sub_ret(R, lo, hi):
    valid = R["valid"]
    mi = R["mi"]
    acc = {k: [0.0, 0] for k in KEYS}
    for i in range(len(valid) - 1):
        d = valid[i]["date"]
        m = d[:7]
        if not (lo <= d < hi) or m > "2026-07":
            continue
        acc[valid[i]["key"]][0] += math.log(valid[i + 1]["price"] / valid[i]["price"]) - math.log1p(ipca[m]) / mi[m]
        acc[valid[i]["key"]][1] += 1
    return {k: ((math.expm1(v[0] * 252 / v[1]) * 100) if v[1] else None, v[1]) for k, v in acc.items()}


print("\n===== SUBSAMPLES (final rule, real annualized %, n intervals) =====")
for lo, hi in [("2006-01-01", "2016-01-01"), ("2016-01-01", "2027-01-01"), ("2006-01-01", "2013-01-01"), ("2013-01-01", "2020-01-01"), ("2020-01-01", "2027-01-01")]:
    s = sub_ret(R, lo, hi)
    f = lambda a, b: None if s[a][0] is None or s[b][0] is None else round(s[a][0] - s[b][0], 1)
    print(lo, "->", hi, {k: (None if v[0] is None else round(v[0], 1), v[1]) for k, v in s.items()}, "| spread JD:", f("EU_JD", "ED_JD"), "spread JU:", f("EU_JU", "ED_JU"))

# ---------- sensitivity: window x confirmations ----------
print("\n===== SENSITIVITY window x confirmations (real annualized %) =====")
for w in [42, 63, 84, 126]:
    for c in [1, 2, 3]:
        S = run(window=w, confirm=c)
        r = S["ret"]
        et = sum(S["ecal"].values())
        print(f"w={w:3d} c={c}: EU_JD={r['EU_JD']['realA'] * 100:6.1f} ED_JD={r['ED_JD']['realA'] * 100:6.1f} EU_JU={r['EU_JU']['realA'] * 100:6.1f} ED_JU={r['ED_JU']['realA'] * 100:6.1f} | sprJD={(r['EU_JD']['realA'] - r['ED_JD']['realA']) * 100:6.1f} sprJU={(r['EU_JU']['realA'] - r['ED_JU']['realA']) * 100:6.1f} | EUshare={S['ecal'][1] / et * 100:5.1f} epE={S['nEvE']} epC={S['nEvC']} le30={S['le30']} med={S['med']}")

# ---------- sensitivity: rate override ----------
print("\n===== SENSITIVITY: rates override =====")
S = run(rate_override_from=None)
r = S["ret"]
print("No override (mechanical file: Hike from 2026-04-16):", {k: round(r[k]["realA"] * 100, 1) for k in KEYS}, "| rate events", len(S["re"]), "last", S["re"][-1]["regime"], S["re"][-1]["start"], "| combined events", S["nEvC"], "| shares", {k: round(v * 100, 1) for k, v in S["shares"].items()})
# how much did 2026-04-16..2026-07-31 contribute?
seg = [(valid[i], valid[i + 1]) for i in range(len(valid) - 1) if "2026-04-16" <= valid[i]["date"] and valid[i]["date"][:7] <= "2026-07"]
print("segment 2026-04-16..2026-07-31: intervals", len(seg), "nominal cum %.1f%%" % (math.expm1(sum(math.log(b["price"] / a["price"]) for a, b in seg)) * 100))

# ---------- daily rule comparison (doc section 8) ----------
print("\n===== DAILY RULE (no monthly filter) =====")


def run_daily(lag=1):
    rows = base
    n = len(rows)
    logeps = [math.log(r["eps"]) for r in rows]
    sl = [None] * n
    for i in range(62, n):
        sl[i] = slope(logeps[i - 62:i + 1])
    valid = []
    for i in range(n):
        j = i - lag
        if j < 62:
            continue
        d = rows[i]["date"]
        rt = 0 if d >= "2025-05-07" else rate.get(d)
        if rt is None:
            continue
        e = 1 if sl[j] > 0 else 0
        valid.append(dict(date=d, e=e, r=rt, key=f"{'EU' if e else 'ED'}_{'JU' if rt else 'JD'}"))
    comb = make_events(valid, "key")
    ee = make_events(valid, "e")
    durs = sorted(e["dur"] for e in comb)
    up_td = sum(1 for v in valid if v["e"]) / len(valid)
    up_cal = sum(e["dur"] for e in ee if e["regime"] == 1) / sum(e["dur"] for e in ee)
    return len(ee), len(comb), sum(1 for e in comb if e["dur"] <= 30), durs[len(durs) // 2], round(up_td * 100, 1), round(up_cal * 100, 1), ee[-1]["start"]


for lag in [0, 1]:
    print(f"lag={lag}: (earnings ev, combined ev, <=30d, median, up% td, up% cal, current up since):", run_daily(lag))

# ---------- interactive HTML cumulative check ----------
print("\n===== CUMULATIVE (nominal, all intervals incl Aug-2026) =====")
cum = defaultdict(float)
v = R["valid"]
for i in range(len(v) - 1):
    cum[v[i]["key"]] += math.log(v[i + 1]["price"] / v[i]["price"])
print({k: round(math.expm1(x), 4) for k, x in cum.items()})
