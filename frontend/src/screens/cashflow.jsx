/* ============================================================
   Screen — Cash Flow & Expenses (Germany / EUR)
   Expandable category groups → subcategories with running sums,
   Investment overview, grand total, drill-down.
   ============================================================ */
/* eslint-disable */
import { useState, useMemo, useEffect } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Dropdown, DDItem, Donut, CashBars } from '../ui.jsx';
import { getCashflowMonthly, getCategoryExpenses, getCategoryIncome, getCategoryInvestments, getTransactions } from '../lib/api.ts';
import { saveCache, loadCache } from '../lib/cache.ts';

export function CashFlowScreen({ go, currency, household }) {
  const M = (v, dec) => FMT.display(currency, v, dec);
  const MC = (v) => FMT.compactCur(currency, v);
  const [view, setView] = useState('monthly');     // monthly | yearly
  const [fAcct, setFAcct] = useState('all');
  const [drill, setDrill] = useState(null);
  const [sort, setSort] = useState('amount');       // amount | name
  const [expanded, setExpanded] = useState(() => new Set());  // all groups collapsed by default

  const _adaptCf = (data) => data.map(m => {
    const [y, mo] = m.month.split('-').map(Number);
    return { key: m.month, label: DATA.MONTHS[mo - 1], year: y, income: m.income, expense: m.expense, net: m.net };
  });
  const _cachedCf = loadCache('cashflow');
  const [cf, setCf] = useState(() => _cachedCf ? _adaptCf(_cachedCf) : DATA.CASHFLOW);
  const [liveCatExp, setLiveCatExp] = useState(() => loadCache('cat_expenses'));
  const [liveCatInc, setLiveCatInc] = useState(() => loadCache('cat_income'));
  const [liveCatInv, setLiveCatInv] = useState(() => loadCache('cat_invest'));
  const [monthSel, setMonthSel] = useState(null);   // 'YYYY-MM' for monthly view
  const [drillTxs, setDrillTxs] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    getCashflowMonthly(12)
      .then(data => {
        saveCache('cashflow', data);
        const adapted = _adaptCf(data);
        setCf(adapted);
        // default the picker to the most recent month that actually has activity
        if (!monthSel) {
          let idx = adapted.length - 1;
          for (let i = adapted.length - 1; i >= 0; i--) {
            if (adapted[i].income > 0 || adapted[i].expense > 0) { idx = i; break; }
          }
          setMonthSel(adapted[idx]?.key ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch the category breakdowns (expense / income / investment) for exactly the
  // period being shown, so every donut on this screen reflects the same window.
  useEffect(() => {
    if (view === 'monthly' && !monthSel) return;
    const opts = view === 'yearly' ? 12 : { month: monthSel };
    getCategoryExpenses(opts)
      .then(data => { saveCache('cat_expenses', data); setLiveCatExp(data); })
      .catch(() => {});
    getCategoryIncome(opts)
      .then(data => { saveCache('cat_income', data); setLiveCatInc(data); })
      .catch(() => {});
    getCategoryInvestments(opts)
      .then(data => { saveCache('cat_invest', data); setLiveCatInv(data); })
      .catch(() => {});
  }, [view, monthSel]);

  useEffect(() => {
    if (!drill) { setDrillTxs([]); return; }
    setDrillLoading(true);
    // Scope the drill-down to exactly the period the breakdown is showing.
    const period = view === 'yearly' ? { months: 12 } : { month: monthSel };
    getTransactions(500, drill, period)
      .then(data => { setDrillTxs(data); setDrillLoading(false); })
      .catch(() => { setDrillTxs([]); setDrillLoading(false); });
  }, [drill, view, monthSel]);

  const selEntry = useMemo(() => cf.find(m => m.key === monthSel) ?? null, [cf, monthSel]);
  const periodLabel = view === 'yearly'
    ? 'Trailing 12 months'
    : (selEntry ? `${selEntry.label} ${selEntry.year}` : '—');
  const periodInc = view === 'monthly'
    ? (selEntry?.income ?? 0)
    : cf.reduce((s, m) => s + m.income, 0);

  const groups = useMemo(() => {
    const GROUP_COLORS = Object.fromEntries(DATA.EXPENSE_GROUPS.map(g => [g.group, g.color]));
    let base;
    if (liveCatExp) {
      const catMap = Object.fromEntries(DATA.CATEGORIES.map(c => [c.id, c]));
      const raw = {};
      for (const { category, total_base, txn_count } of liveCatExp) {
        const cat = catMap[category];
        // An outflow tagged with an income category (e.g. a returned rental deposit)
        // shouldn't appear under "Income" in a spending breakdown — bucket it as Other.
        const groupName = !cat ? 'Other' : (cat.kind === 'income' ? 'Other' : cat.group);
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
  const periodExp = expTotal;
  const invScale = view === 'yearly' ? 12 : 1;

  // Income sources for the period. Live data (income-by-category) sums to the same
  // window as the Income KPI; otherwise fall back to the mock breakdown.
  const incomeGroups = useMemo(() => {
    const catMap = Object.fromEntries(DATA.CATEGORIES.map(c => [c.id, c]));
    // A loaded array (even empty) is authoritative — only fall back to mock when the
    // backend has never responded (null), so a quiet month shows nothing, not demo data.
    if (Array.isArray(liveCatInc)) {
      return liveCatInc.map(({ category, total_base, txn_count }) => {
        const cat = catMap[category];
        return { id: category, name: cat?.name ?? category, amount: total_base, color: cat?.color ?? '#86EFAC', txns: txn_count };
      }).sort((a, b) => b.amount - a.amount);
    }
    return DATA.INCOME_SUBS.map(s => ({ ...s, txns: s.txns ?? 0 }));
  }, [liveCatInc]);
  const incomeTotal = useMemo(() => incomeGroups.reduce((s, g) => s + g.amount, 0), [incomeGroups]);

  // Money put to work this period (investment buys), by category. Live data is already
  // scoped to the period; the mock fallback is monthly, so scale it for the yearly view.
  const investLive = Array.isArray(liveCatInv);
  const investGroups = useMemo(() => {
    const catMap = Object.fromEntries(DATA.CATEGORIES.map(c => [c.id, c]));
    if (investLive) {
      return liveCatInv.map(({ category, total_base, txn_count }) => {
        const cat = catMap[category];
        return {
          id: category, name: cat?.name ?? category, amount: total_base,
          color: cat?.color ?? 'var(--accent)',
          note: `${txn_count} ${txn_count === 1 ? 'transaction' : 'transactions'}`,
          txns: txn_count,
        };
      }).sort((a, b) => b.amount - a.amount);
    }
    return DATA.INVEST_SUBS.map(s => ({ ...s, amount: s.amount * invScale }));
  }, [investLive, liveCatInv, invScale]);
  // Buys (etf = passive Sparplan, trading = active) drive the "money put to work" donut.
  // Sells are an inflow out of investments — shown separately, never in the buy donut.
  const investBuys = useMemo(() => investGroups.filter(g => g.id !== 'investment_sell'), [investGroups]);
  const investSold = useMemo(() => investGroups.find(g => g.id === 'investment_sell') ?? null, [investGroups]);
  const periodInv = useMemo(() => investBuys.reduce((s, g) => s + g.amount, 0), [investBuys]);
  const investNet = periodInv - (investSold?.amount ?? 0);

  const netSaved = periodInc - periodExp;
  const savingsRate = periodInc > 0 ? Math.round(netSaved / periodInc * 100) : 0;
  const maxGroup = Math.max(...groups.map(g => g.total));

  // "vs last period" deltas — month-over-month in monthly view. Yearly view has no
  // prior 12-month window in the fetched data, so we leave the delta off there.
  const cfIdx = useMemo(() => cf.findIndex(m => m.key === monthSel), [cf, monthSel]);
  const fmtDelta = (pct) => {
    if (pct == null || !isFinite(pct)) return null;
    return (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%';
  };
  const incDelta = view === 'monthly' && cfIdx > 0 && cf[cfIdx - 1].income > 0
    ? (cf[cfIdx].income - cf[cfIdx - 1].income) / cf[cfIdx - 1].income * 100 : null;
  const expDelta = view === 'monthly' && cfIdx > 0 && cf[cfIdx - 1].expense > 0
    ? (cf[cfIdx].expense - cf[cfIdx - 1].expense) / cf[cfIdx - 1].expense * 100 : null;

  const toggle = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setExpanded(new Set(groups.map(g => g.group)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="page rise">
      <div className="page-h">
        <h1>Cash Flow & Expenses</h1>
        <span className="sub">{periodLabel} · {household === 'household' ? 'Household' : DATA.USERS[household].name}</span>
        <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
          {view === 'monthly' && (
            <Dropdown label="Month" searchable display={selEntry ? `${selEntry.label} ${selEntry.year}` : '—'}>
              {[...cf].reverse().map(m => (
                <DDItem key={m.key} on={m.key === monthSel} onClick={() => setMonthSel(m.key)} search={`${m.label} ${m.year}`}>
                  {m.label} {m.year}
                </DDItem>
              ))}
            </Dropdown>
          )}
          <div className="tabs">
            <button className={view === 'monthly' ? 'on' : ''} onClick={() => setView('monthly')}>Monthly</button>
            <button className={view === 'yearly' ? 'on' : ''} onClick={() => setView('yearly')}>Yearly</button>
          </div>
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
        <KpiCard label={view === 'monthly' ? 'Income' : 'Income · 12 mo'} val={M(periodInc)} accent="var(--pos)" icon="cashflow" delta={fmtDelta(incDelta)} deltaGood={incDelta >= 0} />
        <KpiCard label={view === 'monthly' ? 'Expenses' : 'Expenses · 12 mo'} val={M(periodExp)} accent="var(--neg)" icon="wallet" delta={fmtDelta(expDelta)} deltaGood={expDelta <= 0} />
        <KpiCard label="Invested" val={M(periodInv)} accent="var(--accent)" icon="trend" sub={investBuys.length ? investBuys.slice(0, 4).map(g => g.name).join(' · ') : 'No buys this period'} />
        <KpiCard label="Net saved" val={M(netSaved)} accent="var(--c-realestate)" icon="bolt" sub={savingsRate + '% savings rate'} />
      </div>

      {/* INCOME VS EXPENSES  +  INVESTMENT OVERVIEW (top row) */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(340px, 1fr)', marginBottom: 18 }}>
        <section className="card">
          <div className="card-h">
            <div className="t"><b>Income vs expenses</b> · last 12 months</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <span className="legend-row"><i style={{ background: 'var(--pos)' }} />Income</span>
              <span className="legend-row"><i style={{ background: 'var(--neg)' }} />Expenses</span>
            </div>
          </div>
          <CashBars data={cf} h={232} selectedKey={view === 'monthly' ? monthSel : null}
            onSelect={(d) => { if (!d.key) return; setView('monthly'); setMonthSel(d.key); }} />
        </section>
        <InvestmentOverview view={view} investBuys={investBuys} investSold={investSold}
          periodInv={periodInv} investNet={investNet} M={M} MC={MC} setDrill={setDrill} />
      </div>

      {/* INCOME SOURCES (donut + breakdown) */}
      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', marginBottom: 18 }}>
        <section className="card">
          <div className="card-h"><div className="t"><b>Where it comes from</b></div></div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
            <Donut segments={incomeGroups.map(g => ({ value: g.amount, color: g.color, label: g.name }))} size={184} stroke={26}
              center={<><div className="num" style={{ fontSize: 24, fontWeight: 800 }}>{MC(incomeTotal)}</div><div className="kpi-sub">{view === 'monthly' ? (selEntry ? `${selEntry.label} ${selEntry.year}` : 'month') : '12 months'}</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {incomeGroups.map(g => (
              <div key={g.id} className="legend-row clickable" style={{ justifyContent: 'space-between' }} onClick={() => setDrill(g.id)}>
                <span className="legend-row"><i style={{ background: g.color }} />{g.name}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{incomeTotal > 0 ? Math.round(g.amount / incomeTotal * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div className="t"><b>Income by source</b></div><span className="kpi-sub" style={{ marginLeft: 'auto' }}>Click a source to drill into transactions</span></div>
          <div>
            {incomeGroups.map((g, i) => {
              const maxInc = Math.max(...incomeGroups.map(x => x.amount), 1);
              return (
                <div key={g.id} className="clickable" onClick={() => setDrill(g.id)}
                  style={{ display: 'grid', gridTemplateColumns: '20px 1fr 120px 110px 18px', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: i < incomeGroups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} />
                  <div>
                    <div className="row" style={{ gap: 8, marginBottom: 7 }}>
                      <b style={{ fontSize: 14 }}>{g.name}</b>
                      <span className="fx">{g.txns} txns</span>
                    </div>
                    <div className="bar" style={{ height: 6 }}><i style={{ width: (g.amount / maxInc * 100) + '%', background: g.color, boxShadow: 'none' }} /></div>
                  </div>
                  <span className="mono" style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12.5 }}>{incomeTotal > 0 ? Math.round(g.amount / incomeTotal * 100) : 0}%</span>
                  <span className="mono" style={{ textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{M(g.amount)}</span>
                  <Icon n="chevR" s={13} c="var(--text-3)" />
                </div>
              );
            })}
            <div className="spread" style={{ padding: '16px 4px 2px' }}>
              <b style={{ fontSize: 14 }}>Total income</b>
              <span className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--pos)' }}>{M(incomeTotal)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* EXPENSE GROUPS (expandable) + DONUT */}
      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', marginBottom: 18 }}>
        <section className="card">
          <div className="card-h"><div className="t"><b>Where it goes</b></div></div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
            <Donut segments={groups.map(g => ({ value: g.total, color: g.color, label: g.group }))} size={184} stroke={26}
              center={<><div className="num" style={{ fontSize: 24, fontWeight: 800 }}>{MC(periodExp)}</div><div className="kpi-sub">{view === 'monthly' ? (selEntry ? `${selEntry.label} ${selEntry.year}` : 'month') : '12 months'}</div></>} />
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
                    <span className="mono" style={{ textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{M(g.total)}</span>
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
                          <span className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{M(s.amount)}</span>
                          <Icon n="chevR" s={13} c="var(--text-3)" />
                        </div>
                      ))}
                      <div className="spread" style={{ padding: '8px 8px 0', marginTop: 2 }}>
                        <span className="kpi-sub">Subtotal · {g.group}</span>
                        <span className="mono" style={{ fontWeight: 800, color: g.color }}>{M(g.total)}</span>
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

      {drill && <DrillModal catId={drill} currency={currency} household={household} onClose={() => setDrill(null)} go={go} rows={drillTxs} loading={drillLoading} month={view === 'monthly' ? monthSel : null} />}
    </div>
  );
}

function InvestmentOverview({ view, investBuys, investSold, periodInv, investNet, M, MC, setDrill }) {
  return (
    <section className="card">
      <div className="card-h">
        <Icon n="trend" s={16} c="var(--accent)" />
        <div className="t"><b>Investment overview</b> · {view === 'monthly' ? 'this month' : 'this year'}</div>
        <span className="tag accent" style={{ marginLeft: 'auto' }}>Savings</span>
      </div>
      {investBuys.length === 0 && !investSold ? (
        <div className="kpi-sub" style={{ padding: '24px 4px' }}>No investment activity this period.</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
            <Donut segments={investBuys.map(s => ({ value: s.amount, color: s.color, label: s.name }))} size={150} stroke={22}
              center={<><div className="num" style={{ fontSize: 21, fontWeight: 800 }}>{MC(periodInv)}</div><div className="kpi-sub">invested</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {investBuys.map((s, i) => (
              <div key={s.id} className="clickable" onClick={() => setDrill(s.id)}
                style={{ display: 'grid', gridTemplateColumns: '14px 1fr 92px 16px', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: i < investBuys.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                <div><b style={{ fontSize: 13 }}>{s.name}</b><div className="fx">{s.note}</div></div>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 800, fontSize: 13.5 }}>{M(s.amount)}</span>
                <Icon n="chevR" s={12} c="var(--text-3)" />
              </div>
            ))}
            <div className="spread" style={{ padding: '12px 4px 0' }}>
              <b style={{ fontSize: 13.5 }}>Total invested</b>
              <span className="num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{M(periodInv)}</span>
            </div>
            {investSold && (
              <>
                <div className="clickable spread" onClick={() => setDrill('investment_sell')}
                  style={{ padding: '9px 4px', marginTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span className="row" style={{ gap: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: investSold.color }} />
                    <span><b style={{ fontSize: 13 }}>Sold / withdrawn</b><div className="fx">{investSold.note}</div></span>
                  </span>
                  <span className="mono" style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--neg)' }}>−{M(investSold.amount)}</span>
                </div>
                <div className="spread" style={{ padding: '4px 4px 0' }}>
                  <b style={{ fontSize: 13.5 }}>Net invested</b>
                  <span className="num" style={{ fontSize: 16, fontWeight: 800, color: investNet >= 0 ? 'var(--accent)' : 'var(--neg)' }}>{M(investNet)}</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function KpiCard({ label, val, accent, icon, delta, deltaGood, sub }) {
  return (
    <div className="card tight">
      <div className="spread">
        <div className="kpi-label">{label}</div>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'color-mix(in srgb,' + accent + ' 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={icon} s={16} c={accent} /></span>
      </div>
      <div className="num" style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>{val}</div>
      {delta && <div className={'delta ' + (deltaGood ? 'pos' : 'neg')} style={{ marginTop: 6 }}>{delta} vs last period</div>}
      {sub && <div className="kpi-sub" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function DrillModal({ catId, currency, household, onClose, go, rows, loading, month }) {
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
        <button className="btn ghost" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => { onClose(); go('transactions', { category: catId, month: month || undefined }); }}>Open in Transactions <Icon n="arrowR" s={14} /></button>
      </div>
    </div>
  );
}
