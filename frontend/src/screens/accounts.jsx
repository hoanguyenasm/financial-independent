/* ============================================================
   Screen — Accounts & Net Worth
   ============================================================ */
/* eslint-disable */
import React, { useState } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Donut, AreaChart } from '../ui.jsx';

export function AccountsScreen({ go, currency, household }) {
  const M = (v, dec) => FMT.display(currency, v, dec);
  const MC = (v) => FMT.displayCompact(currency, v);
  const S = DATA.SUMMARY;
  const [range, setRange] = useState('24');

  const nw = DATA.NW_SERIES;
  const series = range === '12' ? nw.slice(-12) : nw;
  const startV = series[0].value, endV = series[series.length - 1].value;
  const change = endV - startV, changePct = change / startV;

  const calc = (a) => {
    const value = a.qty * a.price, cost = a.qty * a.avg;
    return { value, cost, valueBase: FMT.toBase(a.currency, value), costBase: FMT.toBase(a.currency, cost), gain: (a.price - a.avg) / a.avg };
  };
  const groups = [
    { key: 'stocks', label: 'Stocks & ETFs', items: DATA.ASSETS.filter(a => a.type === 'stocks') },
    { key: 'crypto', label: 'Crypto', items: DATA.ASSETS.filter(a => a.type === 'crypto') },
    { key: 'gold', label: 'Gold', items: DATA.ASSETS.filter(a => a.type === 'gold') },
    { key: 'realestate', label: 'Real estate', items: DATA.ASSETS.filter(a => a.type === 'realestate') },
  ];

  return (
    <div className="page rise">
      <div className="page-h">
        <h1>Accounts & Net Worth</h1>
        <span className="sub">{DATA.ACCOUNTS.filter(a => a.is_active).length} active accounts · {currency} base</span>
      </div>

      {/* NET WORTH + ALLOCATION */}
      <div className="grid" style={{ gridTemplateColumns: '1.7fr 1fr', marginBottom: 18 }}>
        <section className="card">
          <div className="card-h">
            <div>
              <div className="kpi-label">Total net worth</div>
              <div className="row" style={{ gap: 12, marginTop: 4 }}>
                <div className="num" style={{ fontSize: 38, fontWeight: 800 }}>{M(endV)}</div>
                <div className={'tag ' + (change >= 0 ? 'pos' : 'neg')}><Icon n="trend" s={12} />{change >= 0 ? '+' : ''}{MC(change)} · {(changePct * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div className="tabs" style={{ marginLeft: 'auto' }}>
              <button className={range === '12' ? 'on' : ''} onClick={() => setRange('12')}>12M</button>
              <button className={range === '24' ? 'on' : ''} onClick={() => setRange('24')}>24M</button>
            </div>
          </div>
          <AreaChart id="nw" values={series.map(p => p.value)} h={210} color="var(--accent)" gridY={4} />
          <div className="spread" style={{ marginTop: 8 }}>
            {series.filter((_, i) => i % Math.ceil(series.length / 6) === 0).map((p, i) => <span key={i} className="fx">{p.label} {String(p.year).slice(2)}</span>)}
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div className="t"><b>Asset allocation</b></div></div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
            <Donut segments={DATA.ALLOCATION.map(a => ({ value: a.value, color: a.color, label: a.label }))} size={176} stroke={25}
              center={<><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{MC(endV)}</div><div className="kpi-sub">net worth</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DATA.ALLOCATION.map(a => (
              <div key={a.key} className="legend-row" style={{ justifyContent: 'space-between' }}>
                <span className="legend-row"><i style={{ background: a.color }} />{a.label}</span>
                <span className="row" style={{ gap: 10 }}><span className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>{Math.round(a.value / endV * 100)}%</span><span className="mono" style={{ fontWeight: 700 }}>{MC(a.value)}</span></span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ACCOUNTS LIST */}
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-h"><div className="t"><b>Accounts</b></div><span className="kpi-sub" style={{ marginLeft: 'auto' }}>balance · original currency</span></div>
        <div className="gridcols-3">
          {DATA.ACCOUNTS.map(a => (
            <div key={a.id} className="clickable" onClick={() => go('transactions', { account: a.id })}
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-2)', opacity: a.is_active ? 1 : .5 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, flex: '0 0 auto', background: `color-mix(in srgb, var(--c-${a.cls}) 18%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon n={a.cls === 'stocks' ? 'trend' : a.cls === 'crypto' ? 'coin' : a.cls === 'realestate' ? 'building' : a.cls === 'other' ? 'doc' : 'wallet'} s={18} c={`var(--c-${a.cls})`} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7 }}><b style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</b>{!a.is_active && <span className="tag ghost sm">inactive</span>}</div>
                <div className="fx">{a.type} · {a.orig_cur}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 800, fontSize: 15 }}>{MC(a.base)}</div>
                {a.orig_cur !== currency && a.base > 0 && <div className="fx">{FMT.orig(a.orig_cur, a.orig_bal)}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PER-ASSET PERFORMANCE */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Holdings</b> · performance</div></div>
        <div className="tbl-wrap" style={{ border: 'none' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Asset</th><th className="r">Qty</th><th className="r">Avg cost</th><th className="r">Price</th>
                <th className="r">Value ({currency})</th><th className="r">Gain / loss</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <React.Fragment key={g.key}>
                  <tr><td colSpan="6" style={{ height: 34, background: 'var(--bg-soft)' }}>
                    <span className="row" style={{ gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${g.key})` }} /><b className="kpi-sub" style={{ color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 11 }}>{g.label}</b></span>
                  </td></tr>
                  {g.items.map(a => {
                    const c = calc(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="row" style={{ gap: 10 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: `var(--c-${g.key})` }}>{a.name.slice(0, 3)}</span>
                            <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.name}</div><div className="fx">{a.sub}{a.ownership ? ` · ${a.ownership}% owned · ${FMT.display(currency, a.monthly_income)}/mo income` : ''}</div></div>
                          </div>
                        </td>
                        <td className="r mono" style={{ color: 'var(--text-2)' }}>{a.type === 'realestate' ? '—' : a.qty.toLocaleString()}</td>
                        <td className="r mono" style={{ color: 'var(--text-2)' }}>{a.type === 'realestate' ? FMT.display(currency, c.costBase) : FMT.orig(a.currency, a.avg)}</td>
                        <td className="r mono" style={{ color: 'var(--text-2)' }}>{a.type === 'realestate' ? '—' : FMT.orig(a.currency, a.price)}</td>
                        <td className="r mono" style={{ fontWeight: 800 }}>{FMT.display(currency, c.valueBase)}</td>
                        <td className="r mono" style={{ fontWeight: 700, color: c.gain >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                          {c.gain >= 0 ? '+' : ''}{(c.gain * 100).toFixed(1)}%
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, opacity: .85 }}>{c.gain >= 0 ? '+' : ''}{FMT.displayCompact(currency, c.valueBase - c.costBase)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
