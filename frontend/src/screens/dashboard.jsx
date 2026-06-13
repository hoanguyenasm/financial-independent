/* ============================================================
   Screen — FIRE Dashboard (progress-led, direction A)
   ============================================================ */
/* eslint-disable */
import React, { useState, useMemo, useEffect } from 'react';
import { DATA, FMT, FIRE } from '../data.js';
import { Icon, Ring, Spark, AreaChart } from '../ui.jsx';
import { getAnalyticsSummary, captureNWSnapshot, getNWSnapshots } from '../lib/api.ts';

export function DashboardScreen({ go, currency, household }) {
  const S = DATA.SUMMARY;
  const M = (v, dec) => FMT.display(currency, v, dec);
  const MC = (v) => FMT.displayCompact(currency, v);

  const [needsReview, setNeedsReview] = useState(S.needs_review);
  const [passiveIncome, setPassiveIncome] = useState(S.passive_income);
  const [monthlyExpenses, setMonthlyExpenses] = useState(S.monthly_expenses);
  const [savingsRatePct, setSavingsRatePct] = useState(S.savings_rate_month);
  const [netWorth, setNetWorth] = useState(S.net_worth);
  const [fiTarget, setFiTarget] = useState(S.fi_target);
  const [baseMonthlySavings, setBaseMonthlySavings] = useState(S.base_monthly_savings);
  const [liveNW, setLiveNW] = useState([]);

  useEffect(() => {
    getAnalyticsSummary()
      .then(s => {
        setNeedsReview(s.needs_review);
        setPassiveIncome(s.passive_income_monthly);
        setMonthlyExpenses(s.monthly_expenses);
        setSavingsRatePct(Math.round(s.savings_rate * 100));
        if (s.net_worth > 0) setNetWorth(s.net_worth);
        if (s.fi_target > 0) setFiTarget(s.fi_target);
        if (s.base_monthly_savings > 0) setBaseMonthlySavings(s.base_monthly_savings);
      })
      .catch(() => {});
    captureNWSnapshot().catch(() => {});
    getNWSnapshots(24).then(snaps => {
      if (snaps.length >= 2) setLiveNW(snaps);
    }).catch(() => {});
  }, []);

  const baseN = useMemo(() => FIRE.monthsToFI(baseMonthlySavings), [baseMonthlySavings]);
  const [extra, setExtra] = useState(0);
  const n = useMemo(() => FIRE.monthsToFI(baseMonthlySavings + extra), [baseMonthlySavings, extra]);
  const fiD = FIRE.fiDate(n);
  const aheadBase = Math.round((S.plan_date - FIRE.fiDate(baseN)) / (1000 * 60 * 60 * 24 * 30.44));
  const ahead = Math.round((S.plan_date - fiD) / (1000 * 60 * 60 * 24 * 30.44));
  const saved = baseN - n;
  const pct = fiTarget > 0 ? netWorth / fiTarget : 0;

  const coverage = passiveIncome / (monthlyExpenses || 1);
  const savingsSeries = [40, 52, 46, 60, 50, 55, 48, 63, 54, 58, 51, 74];

  return (
    <div className="page rise">
      <div className="page-h">
        <h1>FIRE Dashboard</h1>
        <span className="sub">Household · {FMT.fmtMonthYear(DATA.TODAY)} · everything in {currency}</span>
      </div>

      {/* HERO */}
      <section className="card" style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1.62fr 1fr' }}>
        <div style={{ padding: '26px 30px' }}>
          <div className="eyebrow">Financial independence · net worth</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 12 }}>
            <div className="num" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em', lineHeight: .95 }}>{M(netWorth)}</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-3)', marginBottom: 7 }}>/ {M(fiTarget)}</div>
            <div className="tag accent" style={{ margin: '0 0 9px auto', fontSize: 14 }}>{(pct * 100).toFixed(1)}% there</div>
          </div>
          <div className="fx" style={{ marginBottom: 22 }}>incl. {M(S.re_equity)} Stuttgart apartment · <span style={{ color: 'var(--pos)' }}>+{MC(9200)} this month</span></div>

          <div className="bar" style={{ height: 18 }}><i style={{ width: pct * 100 + '%' }} /></div>
          <div style={{ position: 'relative', height: 30, marginTop: 18 }}>
            {[['0%', MC(0)], ['25%', MC(fiTarget * 0.25)], ['50%', MC(fiTarget * 0.5)], ['75%', 'Lean FI'], ['100%', 'FI · ' + MC(fiTarget)]].map(([l, t], i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ position: 'absolute', top: -22, left: l, width: 1, height: 14, background: i === 4 ? 'var(--accent)' : 'var(--border-2)', transform: 'translateX(-50%)', boxShadow: i === 4 ? '0 0 8px var(--accent)' : 'none' }} />}
                <span style={{ position: 'absolute', left: l, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: i === 4 ? 'var(--accent)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{t}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="sep" style={{ margin: '26px 0 18px' }} />
          <div style={{ display: 'flex', gap: 34 }}>
            <SubStat label="Invested assets" val={M(S.invested)} sub="42% of net worth" onClick={() => go('accounts')} />
            <SubStat label="Real estate equity" val={M(S.re_equity)} sub="Stuttgart apartment · 100%" onClick={() => go('accounts')} />
            <SubStat label="Cash & savings" val={M(S.cash)} sub="Comdirect · ING · Revolut" onClick={() => go('accounts')} />
          </div>
        </div>

        <div style={{ padding: '26px 30px', borderLeft: '1px solid var(--border)', background: 'linear-gradient(180deg,rgba(56,189,248,.05),transparent)' }}>
          <div className="eyebrow">Time to financial independence</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}>
            <span className="num" style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-.03em', lineHeight: .9 }}>{Math.floor(baseN / 12)}</span>
            <span style={{ fontSize: 21, fontWeight: 700, color: 'var(--text-2)' }}>yrs</span>
            <span className="num" style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-.03em', lineHeight: .9, marginLeft: 8 }}>{baseN % 12}</span>
            <span style={{ fontSize: 21, fontWeight: 700, color: 'var(--text-2)' }}>mos</span>
          </div>
          <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Projected FI · <span className="acc-c">{FMT.fmtMonthYear(FIRE.fiDate(baseN))}</span></div>
          <div className={'tag ' + (aheadBase >= 0 ? 'pos' : 'neg')} style={{ marginTop: 14, fontSize: 13 }}>
            <Icon n={aheadBase >= 0 ? 'trend' : 'cashflow'} s={12} />{Math.abs(aheadBase)} months {aheadBase >= 0 ? 'ahead' : 'behind'} of plan</div>

          <div className="sep" style={{ margin: '24px 0' }} />
          <div className="kpi-label" style={{ marginBottom: 10 }}>Net-worth trajectory</div>
          <AreaChart id="hero"
            values={liveNW.length >= 2 ? liveNW.map(s => s.net_worth) : DATA.NW_SERIES.map(p => p.value)}
            h={96} color="var(--accent)" target={fiTarget} targetLabel={MC(fiTarget) + ' · FI'} gridY={2} max={fiTarget * 1.04} />
        </div>
      </section>

      {/* 4 METRICS */}
      <div className="gridcols-4" style={{ marginTop: 18 }}>
        <div className="card tight">
          <div className="kpi-label">Passive income coverage</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
            <Ring pct={coverage} size={88} color="var(--pos)" label={Math.round(coverage * 100) + '%'} />
            <div>
              <div className="num" style={{ fontSize: 19, fontWeight: 800 }}>{M(passiveIncome)}<span style={{ fontSize: 12, color: 'var(--text-3)' }}>/mo</span></div>
              <div className="kpi-sub">of {M(monthlyExpenses)} expenses</div>
              <div className="tag pos sm" style={{ marginTop: 8 }}>+4% vs last yr</div>
            </div>
          </div>
        </div>

        <div className="card tight">
          <div className="kpi-label">Savings rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
            <div className="num pos-c" style={{ fontSize: 32, fontWeight: 800 }}>{savingsRatePct}%</div>
            <div className="kpi-sub">this month</div>
          </div>
          <div className="mini-bars" style={{ marginTop: 12 }}>
            {savingsSeries.map((v, i) => <i key={i} className={i === savingsSeries.length - 1 ? 'hl' : ''} style={{ height: v + '%' }} />)}
          </div>
          <div className="kpi-sub" style={{ marginTop: 10 }}>12-mo avg <b style={{ color: 'var(--text)' }}>{S.savings_rate_avg}%</b></div>
        </div>

        <div className="card tight">
          <div className="kpi-label">Rental & Airbnb income</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 800, marginTop: 12 }}>{M(S.rental_ttm)}<span style={{ fontSize: 13, color: 'var(--text-3)' }}>/mo</span></div>
          <div className="fx" style={{ marginTop: 2 }}>trailing 12-mo net avg</div>
          <div style={{ marginTop: 12 }}><Spark values={[10, 13, 11, 16, 13, 18, 15, 20, 17, 22, 19, 24]} color="var(--c-realestate)" h={38} /></div>
          <div className="kpi-sub" style={{ marginTop: 4 }}>Stuttgart apartment · Airbnb</div>
        </div>

        <div className="card tight clickable" onClick={() => go('transactions', { needsReview: true })}
          style={{ background: 'linear-gradient(165deg,rgba(251,191,36,.1),var(--surface))', borderColor: 'rgba(251,191,36,.25)' }}>
          <div className="spread">
            <div className="kpi-label warn-c">Needs review</div>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', boxShadow: '0 0 9px var(--warn)' }} />
          </div>
          <div className="num warn-c" style={{ fontSize: 44, fontWeight: 800, marginTop: 10 }}>{needsReview}</div>
          <div className="kpi-sub">uncategorized transactions</div>
          <button className="btn ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>Review now <Icon n="arrowR" s={13} /></button>
        </div>
      </div>

      {/* SCENARIO */}
      <section className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr', gap: 30, alignItems: 'center' }}>
          <div>
            <div className="card-h" style={{ marginBottom: 6 }}><Icon n="sliders" s={16} c="var(--accent)" /><div className="t"><b>What if you saved more?</b></div></div>
            <div className="kpi-sub" style={{ marginBottom: 18 }}>Drag to model extra monthly savings and watch your FI date move.</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span className="kpi-sub">+</span>
              <span className="num acc-c" style={{ fontSize: 30, fontWeight: 800 }}>{M(extra)}</span>
              <span className="kpi-sub">/ month</span>
            </div>
            <input type="range" className="rng" min="0" max="3000" step="50" value={extra} onChange={e => setExtra(+e.target.value)} />
            <div className="spread" style={{ marginTop: 8 }}><span className="fx">+{M(0)}</span><span className="fx">+{M(3000)}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center', borderLeft: '1px solid var(--border)', paddingLeft: 30 }}>
            <div>
              <div className="kpi-label">New time to FI</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <span className="num" style={{ fontSize: 44, fontWeight: 800 }}>{Math.floor(n / 12)}</span><span className="kpi-sub" style={{ fontSize: 16 }}>yrs</span>
                <span className="num" style={{ fontSize: 44, fontWeight: 800, marginLeft: 6 }}>{n % 12}</span><span className="kpi-sub" style={{ fontSize: 16 }}>mos</span>
              </div>
              <div className={'tag ' + (saved > 0 ? 'pos' : 'ghost')} style={{ marginTop: 12, fontSize: 12 }}>{saved > 0 ? saved + ' months sooner' : 'No change yet'}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="kpi-label" style={{ marginBottom: 8 }}>FI date moves earlier</div>
              <svg viewBox="0 0 240 70" width="100%" height="70" preserveAspectRatio="none">
                <path d="M0 60 C60 54 110 46 160 36 C200 28 220 22 240 16" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="4 4" />
                <path d="M0 60 C50 50 90 38 130 26 C165 16 195 10 240 4" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
                <circle cx={240 - Math.min(1, extra / 3000) * 70} cy={4 + Math.min(1, extra / 3000) * 6} r="4" fill="var(--accent)" style={{ transition: 'cx .15s' }} />
              </svg>
              <div className="kpi-sub" style={{ marginTop: 4 }}>Projected FI · <b className="acc-c">{FMT.fmtMonthYear(fiD)}</b></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SubStat({ label, val, sub, onClick }) {
  return (
    <div className="clickable" onClick={onClick}>
      <div className="kpi-label">{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{val}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
