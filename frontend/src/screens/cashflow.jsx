/* ============================================================
   Screen — Cash Flow & Expenses (Germany / EUR)
   Expandable category groups → subcategories with running sums,
   Investment overview, grand total, drill-down.
   ============================================================ */
/* eslint-disable */
import { useState, useMemo, useEffect } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Dropdown, DDItem, Donut, CashBars } from '../ui.jsx';
import { getCashflowMonthly, getCategoryExpenses, getTransactions } from '../lib/api.ts';

export function CashFlowScreen({ go, currency, household }) {
  const M = (v, dec) => FMT.display(currency, v, dec);
  const MC = (v) => FMT.compactCur(currency, v);
  const [view, setView] = useState('monthly');     // monthly | yearly
  const [fAcct, setFAcct] = useState('all');
  const [drill, setDrill] = useState(null);
  const [sort, setSort] = useState('amount');       // amount | name
  const [expanded, setExpanded] = useState(() => new Set([DATA.EXPENSE_GROUPS[0].group]));

  const [cf, setCf] = useState(DATA.CASHFLOW);
  const [liveCatExp, setLiveCatExp] = useState(null);
  const [drillTxs, setDrillTxs] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    getCashflowMonthly(12)
      .then(data => {
        setCf(data.map(m => {
          const [y, mo] = m.month.split('-').map(Number);
          return { label: DATA.MONTHS[mo - 1], year: y, income: m.income, expense: m.expense, net: m.net };
        }));
      })
      .catch(() => {});
    getCategoryExpenses(12).then(setLiveCatExp).catch(() => {});
  }, []);

  useEffect(() => {
    if (!drill) { setDrillTxs([]); return; }
    setDrillLoading(true);
    getTransactions(12, drill)
      .then(data => { setDrillTxs(data); setDrillLoading(false); })
      .catch(() => { setDrillTxs([]); setDrillLoading(false); });
  }, [drill]);

  const scale = view === 'yearly' ? 12 : 1;
  const periodInc = (view === 'monthly' ? cf[cf.length - 1].income : cf.reduce((s, m) => s + m.income, 0));
  const periodInv = DATA.INVEST_TOTAL * scale;

  const groups = useMemo(() => {
    const GROUP_COLORS = Object.fromEntries(DATA.EXPENSE_GROUPS.map(g => [g.group, g.color]));
    let base;
    if (liveCatExp) {
      const catMap = Object.fromEntries(DATA.CATEGORIES.map(c => [c.id, c]));
      const raw = {};
      for (const { category, total_base, txn_count } of liveCatExp) {
        const cat = catMap[category];
        const groupName = cat?.group ?? 'Other';
        const groupColor = GROUP_COLORS[groupName] ?? '#8595AD';
        if (!raw[groupName]) raw[groupName] = { group: groupName, color: groupColor, total: 0, subs: [] };
        raw[groupName].total += total_base;
        raw[groupName].subs.push({ id: category, name: cat?.name ?? category, amount: total_base, color: cat?.color ?? '#8595AD', txns: txn_count });
      }
      base = Object.values(raw);
    } else {
      base = DATA.EXPENSE_GROUPS.map(x => ({ ...x, subs: [...x.subs] }));
    }
    const cmp = sort === 'amount' ? (a, b) => b.total - a.total : (a, b) => a.group.localeCompare(b.group);
    base.sort(cmp);
    base.forEach(grp => grp.subs.sort(sort === 'amount' ? (a, b) => b.amount - a.amount : (a, b) => a.name.localeCompare(b.name)));
    return base;
  }, [liveCatExp, sort]);

  const expTotal = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups]);
  const periodExp = expTotal * scale;
  const netSaved = periodInc - periodExp;
  const savingsRate = periodInc > 0 ? Math.round(netSaved / periodInc * 100) : 0;
  const maxGroup = Math.max(...groups.map(g => g.total));

  const toggle = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setExpanded(new Set(groups.map(g => g.group)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="page rise">
      <div className="page-h">
        <h1>Cash Flow & Expenses</h1>
        <span className="sub">{view === 'monthly' ? FMT.fmtMonthYear(DATA.TODAY) : 'Trailing 12 months'} · {household === 'household' ? 'Household' : DATA.USERS[household].name}</span>
        <div className="tabs" style={{ marginLeft: 'auto' }}>
          <button className={view === 'monthly' ? 'on' : ''} onClick={() => setView('monthly')}>Monthly</button>
          <button className={view === 'yearly' ? 'on' : ''} onClick={() => setView('yearly')}>Yearly</button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="filterbar">
        <Dropdown label="Account" display={fAcct === 'all' ? 'All' : DATA.ACCT[fAcct].name}>
          <DDItem on={fAcct === 'all'} onClick={() => setFAcct('all')}>All accounts</DDItem>
          <div className="dd-sep" />
          {DATA.ACCOUNTS.filter(a => a.is_active).map(a => <DDItem key={a.id} on={fAcct === a.id} onClick={() => setFAcct(a.id)}>{a.name}</DDItem>)}
        </Dropdown>
        <span className="kpi-sub" style={{ marginLeft: 'auto' }}>Click a group to expand its subcategories · click a subcategory to drill in</span>
      </div>

      {/* KPI ROW */}
      <div className="gridcols-4" style={{ marginBottom: 18 }}>
        <KpiCard label={view === 'monthly' ? 'Income' : 'Income · 12 mo'} val={M(periodInc)} accent="var(--pos)" icon="cashflow" delta="+6.4%" />
        <KpiCard label={view === 'monthly' ? 'Expenses' : 'Expenses · 12 mo'} val={M(periodExp)} accent="var(--neg)" icon="wallet" delta="−2.1%" deltaPos />
        <KpiCard label="Invested" val={M(periodInv)} accent="var(--accent)" icon="trend" sub="ETF · Trading · Gold · Crypto" />
        <KpiCard label="Net saved" val={M(netSaved)} accent="var(--c-realestate)" icon="bolt" sub={savingsRate + '% savings rate'} />
      </div>

      {/* INCOME VS EXPENSES */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-h">
          <div className="t"><b>Income vs expenses</b> · last 12 months</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <span className="legend-row"><i style={{ background: 'var(--pos)' }} />Income</span>
            <span className="legend-row"><i style={{ background: 'var(--neg)' }} />Expenses</span>
          </div>
        </div>
        <CashBars data={cf} h={232} />
      </section>

      {/* EXPENSE GROUPS (expandable) + DONUT */}
      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', marginBottom: 18 }}>
        <section className="card">
          <div className="card-h"><div className="t"><b>Where it goes</b></div></div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
            <Donut segments={groups.map(g => ({ value: g.total, color: g.color, label: g.group }))} size={184} stroke={26}
              center={<><div className="num" style={{ fontSize: 24, fontWeight: 800 }}>{MC(periodExp)}</div><div className="kpi-sub">{view === 'monthly' ? 'this month' : 'per year'}</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {groups.map(g => (
              <div key={g.group} className="legend-row clickable" style={{ justifyContent: 'space-between' }} onClick={() => { toggle(g.group); }}>
                <span className="legend-row"><i style={{ background: g.color }} />{g.group}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.total / expTotal * 100)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-h">
            <div className="t"><b>Spending by category</b></div>
            <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
              <button className="dd-btn" onClick={() => { expanded.size === groups.length ? collapseAll() : expandAll(); }}>
                {expanded.size === groups.length ? 'Collapse all' : 'Expand all'}
              </button>
              <Dropdown label="Sort" display={sort === 'amount' ? 'Amount' : 'A–Z'}>
                <DDItem on={sort === 'amount'} onClick={() => setSort('amount')}>By amount</DDItem>
                <DDItem on={sort === 'name'} onClick={() => setSort('name')}>Alphabetical</DDItem>
              </Dropdown>
            </div>
          </div>

          <div>
            {groups.map(g => {
              const open = expanded.has(g.group);
              return (
                <div key={g.group} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* group header */}
                  <div className="clickable" onClick={() => toggle(g.group)}
                    style={{ display: 'grid', gridTemplateColumns: '20px 1fr 120px 110px', alignItems: 'center', gap: 12, padding: '12px 4px' }}>
                    <Icon n="chevR" s={15} c="var(--text-3)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }} />
                    <div>
                      <div className="row" style={{ gap: 8, marginBottom: 7 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} />
                        <b style={{ fontSize: 14 }}>{g.group}</b>
                        <span className="kpi-sub">· {g.subs.length} {g.subs.length === 1 ? 'category' : 'categories'}</span>
                      </div>
                      <div className="bar" style={{ height: 6 }}><i style={{ width: (g.total / maxGroup * 100) + '%', background: g.color, boxShadow: 'none' }} /></div>
                    </div>
                    <span className="mono" style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12.5 }}>{Math.round(g.total / expTotal * 100)}%</span>
                    <span className="mono" style={{ textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{M(g.total * scale)}</span>
                  </div>

                  {/* subcategories */}
                  {open && (
                    <div className="fade-in" style={{ padding: '2px 4px 12px', marginLeft: 32 }}>
                      {g.subs.map((s, i) => (
                        <div key={s.id} className="clickable" onClick={() => setDrill(s.id)}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 18px', alignItems: 'center', gap: 12, padding: '8px 8px', borderRadius: 8, borderBottom: i < g.subs.length - 1 ? '1px solid var(--border)' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div className="row" style={{ gap: 9 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                            <span className="fx">{s.txns} txns</span>
                          </div>
                          <div className="bar" style={{ height: 5 }}><i style={{ width: (s.amount / g.total * 100) + '%', background: s.color, boxShadow: 'none' }} /></div>
                          <span className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{M(s.amount * scale)}</span>
                          <Icon n="chevR" s={13} c="var(--text-3)" />
                        </div>
                      ))}
                      <div className="spread" style={{ padding: '8px 8px 0', marginTop: 2 }}>
                        <span className="kpi-sub">Subtotal · {g.group}</span>
                        <span className="mono" style={{ fontWeight: 800, color: g.color }}>{M(g.total * scale)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* GRAND TOTAL */}
            <div className="spread" style={{ padding: '16px 4px 2px' }}>
              <b style={{ fontSize: 14 }}>Total expenses</b>
              <span className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--neg)' }}>{M(periodExp)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* INVESTMENT OVERVIEW */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-h">
          <Icon n="trend" s={16} c="var(--accent)" />
          <div className="t"><b>Investment overview</b> · money put to work {view === 'monthly' ? 'this month' : 'this year'}</div>
          <span className="tag accent" style={{ marginLeft: 'auto' }}>Savings, not spending</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Donut segments={DATA.INVEST_SUBS.map(s => ({ value: s.amount, color: s.color, label: s.name }))} size={168} stroke={24}
              center={<><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{MC(periodInv)}</div><div className="kpi-sub">invested</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {DATA.INVEST_SUBS.map((s, i) => (
              <div key={s.id} className="clickable" onClick={() => setDrill(s.id)}
                style={{ display: 'grid', gridTemplateColumns: '20px 1fr 140px 110px 18px', alignItems: 'center', gap: 12, padding: '11px 6px', borderBottom: i < DATA.INVEST_SUBS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                <div><b style={{ fontSize: 13.5 }}>{s.name}</b><div className="fx">{s.note}</div></div>
                <div className="bar" style={{ height: 6 }}><i style={{ width: (s.amount / DATA.INVEST_SUBS[0].amount * 100) + '%', background: s.color, boxShadow: 'none' }} /></div>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{M(s.amount * scale)}</span>
                <Icon n="chevR" s={13} c="var(--text-3)" />
              </div>
            ))}
            <div className="spread" style={{ padding: '14px 6px 0' }}>
              <b style={{ fontSize: 14 }}>Total invested</b>
              <span className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{M(periodInv)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* TREND */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Top groups</b> · trailing 12 months</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {DATA.CAT_TREND.map(c => <span key={c.id} className="legend-row"><i style={{ background: c.color }} />{c.name}</span>)}
          </div>
        </div>
        <MultiLine series={DATA.CAT_TREND} months={cf.map(m => m.label)} h={210} M={M} />
      </section>

      {drill && <DrillModal catId={drill} currency={currency} household={household} onClose={() => setDrill(null)} go={go} rows={drillTxs} loading={drillLoading} />}
    </div>
  );
}

function KpiCard({ label, val, accent, icon, delta, deltaPos, sub }) {
  return (
    <div className="card tight">
      <div className="spread">
        <div className="kpi-label">{label}</div>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'color-mix(in srgb,' + accent + ' 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={icon} s={16} c={accent} /></span>
      </div>
      <div className="num" style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>{val}</div>
      {delta && <div className={'delta ' + (deltaPos ? 'pos' : delta[0] === '−' ? 'neg' : 'pos')} style={{ marginTop: 6 }}>{delta} vs last period</div>}
      {sub && <div className="kpi-sub" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MultiLine({ series, months, h = 200, M }) {
  const w = 1000, pad = 10;
  const all = series.flatMap(s => s.series);
  const hi = Math.max(...all) * 1.1, lo = 0;
  const X = i => pad + i * (w - pad * 2) / (months.length - 1);
  const Y = v => h - 22 - (v - lo) / (hi - lo) * (h - 36);
  const [hov, setHov] = useState(null);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
        onMouseLeave={() => setHov(null)}
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / r.width * (months.length - 1)); setHov(Math.max(0, Math.min(months.length - 1, i))); }}>
        {[0, .5, 1].map((f, i) => { const y = 14 + f * (h - 36); return <line key={i} x1={pad} y1={y} x2={w - pad} y2={y} stroke="var(--border)" />; })}
        {series.map(s => {
          const line = s.series.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
          return <path key={s.id} d={line} fill="none" stroke={s.color} strokeWidth="2.4" />;
        })}
        {hov != null && <line x1={X(hov)} y1="10" x2={X(hov)} y2={h - 22} stroke="var(--border-2)" strokeDasharray="3 3" />}
        {hov != null && series.map(s => <circle key={s.id} cx={X(hov)} cy={Y(s.series[hov])} r="3.5" fill={s.color} />)}
        {months.map((m, i) => i % 2 === 0 && <text key={i} x={X(i)} y={h - 6} textAnchor="middle" fill="var(--text-3)" fontSize="11" fontFamily="JetBrains Mono">{m}</text>)}
      </svg>
      {hov != null && (
        <div style={{ position: 'absolute', top: 0, left: `${X(hov) / w * 100}%`, transform: 'translateX(-50%)', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '9px 12px', pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          <div className="fx" style={{ marginBottom: 5 }}>{months[hov]}</div>
          {series.map(s => <div key={s.id} className="row" style={{ gap: 7, fontSize: 12, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.name}<span style={{ marginLeft: 'auto', paddingLeft: 14 }}>{M(s.series[hov])}</span></div>)}
        </div>
      )}
    </div>
  );
}

function DrillModal({ catId, currency, household, onClose, go, rows, loading }) {
  const total = rows.reduce((s, t) => s + Math.abs(t.amount_base ?? t.amount), 0);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <div className="row" style={{ gap: 10 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: FMT.catColor(catId) }} /><div style={{ fontSize: 17, fontWeight: 800 }}>{FMT.catName(catId)}</div></div>
          <button className="btn ghost icon" onClick={onClose}><Icon n="x" s={16} /></button>
        </div>
        <div className="kpi-sub" style={{ marginBottom: 16 }}>{rows.length} transactions · {FMT.display(currency, total, 2)} total</div>
        <div style={{ maxHeight: 340, overflowY: 'auto', margin: '0 -6px' }}>
          {loading && <div className="kpi-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>}
          {!loading && rows.length === 0 && <div className="kpi-sub" style={{ textAlign: 'center', padding: 24 }}>No transactions this period.</div>}
          {!loading && rows.map(t => (
            <div key={t.id} className="spread" style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{t.description}</div><div className="fx">{t.date} · {t.currency}</div></div>
              <div style={{ textAlign: 'right' }}><div className="mono" style={{ fontWeight: 700, fontSize: 13.5 }}>{FMT.display(t.currency, Math.abs(t.amount), 2)}</div>{t.currency !== currency && t.amount_base != null && <div className="fx">{FMT.display(currency, Math.abs(t.amount_base), 2)}</div>}</div>
            </div>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => { onClose(); go('transactions', { category: catId }); }}>Open in Transactions <Icon n="arrowR" s={14} /></button>
      </div>
    </div>
  );
}
