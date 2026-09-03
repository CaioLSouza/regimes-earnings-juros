import json, math, csv, statistics, datetime as dt
from collections import defaultdict
import numpy as np
import openpyxl

import os
ROOT = os.environ.get("XP_ROOT", "C:/Users/Caio/Documents/Documentos/XP")
AN = f"{ROOT}/tmp/earnings_regimes_analysis"
rng = np.random.default_rng(20260902)

# ---------- inputs ----------
wb = openpyxl.load_workbook(f"{ROOT}/Ibovespa Best EPS.xlsx", read_only=True, data_only=True)
eps_rows = sorted((r[0].date().isoformat(), float(r[1])) for r in wb["Sheet1"].iter_rows(min_row=2, values_only=True)
                  if r[0] is not None and r[1] is not None and float(r[1]) > 0)
ibov = sorted((r["data"], float(r["ibov_close"])) for r in csv.DictReader(open(f"{AN}/ibov_daily_long.csv", newline="")))
rate = {}
for line in open(f"{ROOT}/swap_pre_di_regimes.csv", encoding="utf-8-sig").read().strip().split("\n")[1:]:
    f = line.strip().split(";")
    rate[f[0]] = 1 if f[4] == "Hike" else 0 if f[4] == "Cut" else None
ipca = {}
for fn in ["ipca_2006_2015.json", "ipca_2016_2025.json", "ipca_2026.json"]:
    for r in json.load(open(f"{AN}/ipca/{fn}")):
        d, m, y = r["data"].split("/")
        ipca[f"{y}-{m}"] = float(r["valor"]) / 100

base = []
p = -1
for d, price in ibov:
    while p + 1 < len(eps_rows) and eps_rows[p + 1][0] <= d:
        p += 1
    if p < 0:
        continue
    base.append(dict(date=d, price=price, eps=eps_rows[p][1]))
N0 = len(base)


def slope_series(vals, w):
    x = np.arange(w) - (w - 1) / 2
    den = (x ** 2).sum()
    v = np.asarray(vals, float)
    out = np.full(len(v), np.nan)
    for i in range(w - 1, len(v)):
        seg = v[i - w + 1:i + 1]
        out[i] = (x * (seg - seg.mean())).sum() / den
    return out


def regime_from(series, w=63, confirm=2):
    """month-end observation, `confirm` consecutive opposite signals, effective next trading day"""
    sl = slope_series(series, w)
    me = [(i, 1 if sl[i] > 0 else 0) for i in range(N0)
          if not math.isnan(sl[i]) and (i + 1 == N0 or base[i]["date"][:7] != base[i + 1]["date"][:7])]
    eff = {}
    state = None
    pend = None
    pc = 0
    for i, s in me:
        if state is None:
            state = s
            if i + 1 < N0:
                eff[i + 1] = s
            continue
        if s == state:
            pend, pc = None, 0
            continue
        pc = pc + 1 if pend == s else 1
        pend = s
        if pc >= confirm and i + 1 < N0:
            state = s
            eff[i + 1] = s
            pend, pc = None, 0
    reg = np.full(N0, -1)
    act = -1
    for i in range(N0):
        if i in eff:
            act = eff[i]
        reg[i] = act
    return reg


logeps = [math.log(r["eps"]) for r in base]
logpx = [math.log(r["price"]) for r in base]
earn = regime_from(logeps)
mom = regime_from(logpx)

# ---------- assemble the official panel ----------
rows = []
for i in range(N0):
    d = base[i]["date"]
    rt = 0 if d >= "2025-05-07" else rate.get(d)
    if earn[i] < 0 or rt is None:
        continue
    rows.append((i, d, base[i]["price"], int(earn[i]), rt, int(mom[i])))
print("painel classificado:", len(rows), rows[0][1], "->", rows[-1][1])

mi = defaultdict(int)
for k in range(len(rows) - 1):
    m = rows[k][1][:7]
    if m <= "2026-07" and m in ipca:
        mi[m] += 1
R, E, RT, M, DATE = [], [], [], [], []
for k in range(len(rows) - 1):
    m = rows[k][1][:7]
    if m > "2026-07" or m not in ipca:
        continue
    R.append(math.log(rows[k + 1][2] / rows[k][2]) - math.log1p(ipca[m]) / mi[m])
    E.append(rows[k][3]); RT.append(rows[k][4]); M.append(rows[k][5]); DATE.append(rows[k][1])
R = np.array(R); E = np.array(E); RT = np.array(RT); M = np.array(M)
n = len(R)
print("intervalos com retorno real:", n)

ann = lambda v: (math.expm1(v.sum() * 252 / len(v)) * 100) if len(v) else float("nan")


def spreads(e, rt=RT, r=R):
    """arithmetic annualized difference Up - Down, within each rates state"""
    out = {}
    for s, lab in [(0, "JD"), (1, "JU")]:
        u = r[(e == 1) & (rt == s)]; d = r[(e == 0) & (rt == s)]
        out[lab] = (u.mean() - d.mean()) * 252 * 100 if len(u) and len(d) else float("nan")
    both = r[e == 1].mean() - r[e == 0].mean()
    out["uncond"] = both * 252 * 100
    return out


act = spreads(E)
print("\n=== TESTE 1: rotação circular do rótulo de earnings (exato, todas as N-1 rotações) ===")
print("spread observado (aritm. anualizado, p.p.): JD %.1f | JU %.1f | incondicional %.1f" % (act["JD"], act["JU"], act["uncond"]))
cnt = {"JD": 0, "JU": 0, "uncond": 0}
ok = {"JD": 0, "JU": 0, "uncond": 0}
dist = {"JD": [], "JU": [], "uncond": []}
for k in range(1, n):
    e = np.roll(E, k)
    s = spreads(e)
    for key in cnt:
        if not math.isnan(s[key]):
            cnt[key] += 1
            dist[key].append(s[key])
            if abs(s[key]) >= abs(act[key]):
                ok[key] += 1
for key in ["JD", "JU", "uncond"]:
    a = np.array(dist[key])
    print(f"  {key}: p(rotação, bicaudal) = {ok[key] / cnt[key]:.3f} | percentil do observado = {(a < act[key]).mean() * 100:.1f} | dp da nula = {a.std():.1f} p.p. | faixa nula 5-95% = [{np.percentile(a, 5):.1f}, {np.percentile(a, 95):.1f}]")

# same test for the rates label, as a benchmark of what a real signal looks like
print("\n  Benchmark: mesmo teste para o rótulo de JUROS (spread JD-JU incondicional)")
act_r = (R[RT == 0].mean() - R[RT == 1].mean()) * 252 * 100
dr = []
for k in range(1, n):
    rr = np.roll(RT, k)
    dr.append((R[rr == 0].mean() - R[rr == 1].mean()) * 252 * 100)
dr = np.array(dr)
print(f"  juros: observado {act_r:.1f} p.p. | p(rotação) = {(np.abs(dr) >= abs(act_r)).mean():.3f} | faixa nula 5-95% = [{np.percentile(dr, 5):.1f}, {np.percentile(dr, 95):.1f}]")

print("\n=== TESTE 2: mesmo maquinário aplicado ao PREÇO (momentum) em vez do BPA ===")
agree = (E == M).mean()
print(f"concordância earnings vs momentum: {agree * 100:.1f}% dos dias | momentum Up em {M.mean() * 100:.1f}% | earnings Up em {E.mean() * 100:.1f}%")
for lab, e in [("earnings", E), ("momentum", M)]:
    s = spreads(e)
    print(f"  {lab}: spread JD {s['JD']:.1f} | JU {s['JU']:.1f} | incondicional {s['uncond']:.1f} p.p.")
for lab, e in [("earnings", E), ("momentum", M)]:
    print(f"  {lab} quadrantes (geom. anualizado real %): ", {f"{'U' if a else 'D'}_{'JU' if b else 'JD'}": round(ann(R[(e == a) & (RT == b)]), 1) for a in (1, 0) for b in (0, 1)})

print("\n=== TESTE 3: corte triplo juros x momentum x earnings ===")
print(f"{'juros':>6} {'momentum':>9} {'earnings':>9} {'n':>6} {'real anual %':>13}")
for b in (0, 1):
    for m_ in (1, 0):
        for a in (1, 0):
            sel = (RT == b) & (M == m_) & (E == a)
            if sel.sum() > 20:
                print(f"{'JD' if b == 0 else 'JU':>6} {'Up' if m_ else 'Down':>9} {'Up' if a else 'Down':>9} {sel.sum():>6} {ann(R[sel]):>13.1f}")
print("  earnings marginal, controlando juros E momentum (média dos 4 blocos, ponderada por n):")
num = den = 0
for b in (0, 1):
    for m_ in (1, 0):
        u = R[(RT == b) & (M == m_) & (E == 1)]; d = R[(RT == b) & (M == m_) & (E == 0)]
        if len(u) > 20 and len(d) > 20:
            w = min(len(u), len(d))
            num += (u.mean() - d.mean()) * 252 * 100 * w
            den += w
            print(f"    juros={'JD' if b == 0 else 'JU'} mom={'Up' if m_ else 'Down'}: spread {((u.mean() - d.mean()) * 252 * 100):+.1f} p.p. (n_up={len(u)}, n_down={len(d)})")
print(f"    spread médio ponderado de earnings, controlado: {num / den:+.1f} p.p.")
print("  momentum marginal, controlando juros E earnings:")
num = den = 0
for b in (0, 1):
    for a in (1, 0):
        u = R[(RT == b) & (E == a) & (M == 1)]; d = R[(RT == b) & (E == a) & (M == 0)]
        if len(u) > 20 and len(d) > 20:
            w = min(len(u), len(d))
            num += (u.mean() - d.mean()) * 252 * 100 * w
            den += w
            print(f"    juros={'JD' if b == 0 else 'JU'} earn={'Up' if a else 'Down'}: spread {((u.mean() - d.mean()) * 252 * 100):+.1f} p.p. (n_up={len(u)}, n_down={len(d)})")
print(f"    spread médio ponderado de momentum, controlado: {num / den:+.1f} p.p.")

print("\n=== TESTE 4: bootstrap por episódio (reamostra episódios inteiros, 5000x) ===")
# episode ids on the return panel, defined by the combined (earnings, rates) state
epid = np.zeros(n, int)
k = 0
for i in range(1, n):
    if E[i] != E[i - 1] or RT[i] != RT[i - 1]:
        k += 1
    epid[i] = k
eps_list = [np.where(epid == j)[0] for j in range(epid.max() + 1)]
print("episódios no painel de retorno:", len(eps_list))
boot = {"JD": [], "JU": []}
for _ in range(5000):
    pick = rng.integers(0, len(eps_list), len(eps_list))
    idx = np.concatenate([eps_list[j] for j in pick])
    e, rt, r = E[idx], RT[idx], R[idx]
    for s, lab in [(0, "JD"), (1, "JU")]:
        u = r[(e == 1) & (rt == s)]; d = r[(e == 0) & (rt == s)]
        boot[lab].append((u.mean() - d.mean()) * 252 * 100 if len(u) > 5 and len(d) > 5 else np.nan)
for lab in ["JD", "JU"]:
    a = np.array(boot[lab], float)
    a = a[~np.isnan(a)]
    print(f"  {lab}: observado {act[lab]:+.1f} | IC 90% = [{np.percentile(a, 5):+.1f}, {np.percentile(a, 95):+.1f}] | P(spread>0) = {(a > 0).mean():.2f}")

print("\n=== TESTE 5: horizonte maior (retorno real acumulado à frente, por estado no dia) ===")
cumr = np.concatenate([[0.0], np.cumsum(R)])
for h in [21, 63, 126, 252]:
    print(f"  h={h:3d} pregões:", end="")
    for s, lab in [(0, "JD"), (1, "JU")]:
        v = []
        for a in (1, 0):
            sel = np.where((E == a) & (RT == s))[0]
            sel = sel[sel + h < len(cumr) - 1]
            v.append(np.expm1((cumr[sel + h] - cumr[sel]).mean() * 252 / h) * 100)
        print(f"  {lab}: Up {v[0]:6.1f} Down {v[1]:6.1f} spread {v[0] - v[1]:+6.1f}", end="")
    print()

print("\n=== TESTE 6: quanto do spread JD vem de poucos episódios ===")
for lab, s in [("JD", 0), ("JU", 1)]:
    tot_u = R[(E == 1) & (RT == s)].sum(); tot_d = R[(E == 0) & (RT == s)].sum()
    contrib = []
    for j, idx in enumerate(eps_list):
        if RT[idx[0]] != s:
            continue
        contrib.append((DATE[idx[0]], int(E[idx[0]]), len(idx), R[idx].sum()))
    contrib.sort(key=lambda x: -abs(x[3]))
    print(f"  {lab}: 3 maiores episódios em módulo:", [(c[0], "Up" if c[1] else "Down", c[2], round(c[3] * 100, 1)) for c in contrib[:3]])
    # drop the single largest contributor and recompute
    drop = contrib[0]
    keep = np.ones(n, bool)
    for j, idx in enumerate(eps_list):
        if DATE[idx[0]] == drop[0]:
            keep[idx] = False
    e, rt, r = E[keep], RT[keep], R[keep]
    u = r[(e == 1) & (rt == s)]; d = r[(e == 0) & (rt == s)]
    print(f"     spread sem esse episódio: {(u.mean() - d.mean()) * 252 * 100:+.1f} p.p. (era {act[lab]:+.1f})")
