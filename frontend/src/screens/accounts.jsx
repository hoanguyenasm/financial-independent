/* ============================================================
   Screen — Accounts & Net Worth
   ============================================================ */
/* eslint-disable */
import React, { useState, useEffect } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Donut, AreaChart } from '../ui.jsx';
import { getAccounts, createAccount, getAssets, getNWSnapshots, createAsset, updateAsset } from '../lib/api.ts';

function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}

export function AccountsScreen({ go, currency, household }) {
  const M = (v, dec) => FMT.display(currency, v, dec);
  const MC = (v) => FMT.displayCompact(currency, v);
  const S = DATA.SUMMARY;
  const [range, setRange] = useState('24');

  const [liveAccounts, setLiveAccounts] = useState(DATA.ACCOUNTS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assetModal, setAssetModal] = useState(null);
  const [liveAssets, setLiveAssets] = useState(DATA.ASSETS);
  const [liveNW, setLiveNW] = useState([]);

  useEffect(() => {
    getAccounts().then(data => {
      if (data.length > 0) {
        setLiveAccounts(data.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          orig_cur: a.currency,
          cls: typeToClass(a.type),
          base: 0,
          orig_bal: 0,
          is_active: a.is_active,
        })));
      }
    }).catch(() => {});
    getAssets().then(data => {
      if (data.length > 0) setLiveAssets(data);
    }).catch(() => {});
    getNWSnapshots(24).then(snaps => {
      if (snaps.length >= 2) setLiveNW(snaps);
    }).catch(() => {});
  }, []);

  const nw = liveNW.length >= 2
    ? liveNW.map(s => {
        const d = new Date(s.date);
        return { label: DATA.MONTHS[d.getMonth()], year: d.getFullYear(), value: s.net_worth };
      })
    : DATA.NW_SERIES;
  const series = range === '12' ? nw.slice(-12) : nw;
  const startV = series[0]?.value ?? 0, endV = series[series.length - 1]?.value ?? 0;
  const change = endV - startV, changePct = startV !== 0 ? change / startV : 0;

  const calc = (a) => {
    const value = a.qty * a.price, cost = a.qty * a.avg;
    return { value, cost, valueBase: FMT.toBase(a.currency, value), costBase: FMT.toBase(a.currency, cost), gain: (a.price - a.avg) / a.avg };
  };
  const assets = liveAssets.map(a => {
    const rawType = 'symbol_or_name' in a ? a.asset_type : a.type;
    const name = 'symbol_or_name' in a ? a.symbol_or_name : a.name;
    const type = ['etf', 'stock', 'bond'].includes(rawType) ? 'stocks'
      : rawType === 'real_estate' ? 'realestate'
      : rawType;
    const qty = ('qty' in a ? a.qty : a.quantity) ?? 0;
    const currentVal = 'current_value' in a ? (a.current_value ?? 0) : a.qty * a.price;
    const avgCost = ('avg_cost' in a ? a.avg_cost : a.avg) ?? 0;
    return {
      id: a.id,
      name,
      type,
      sub: rawType,
      qty,
      price: qty > 0 ? currentVal / qty : 0,
      avg: avgCost,
      currency: a.currency,
      ownership: ('ownership_pct' in a ? a.ownership_pct : a.ownership) ?? 100,
      monthly_income: ('expected_monthly_income' in a ? a.expected_monthly_income : a.monthly_income) ?? 0,
    };
  });
  const groups = [
    { key: 'stocks', label: 'Stocks & ETFs', items: assets.filter(a => a.type === 'stocks') },
    { key: 'crypto', label: 'Crypto', items: assets.filter(a => a.type === 'crypto') },
    { key: 'gold', label: 'Gold', items: assets.filter(a => a.type === 'gold') },
    { key: 'realestate', label: 'Real estate', items: assets.filter(a => a.type === 'realestate') },
  ];

  const ALLOC_META = {
    stocks:     { label: 'Stocks & ETFs',  color: 'var(--c-stocks)' },
    realestate: { label: 'Real estate',    color: 'var(--c-realestate)' },
    crypto:     { label: 'Crypto',         color: 'var(--c-crypto)' },
    gold:       { label: 'Gold',           color: 'var(--c-gold)' },
    cash:       { label: 'Cash & savings', color: 'var(--c-cash)' },
  };
  const liveAllocation = React.useMemo(() => {
    if (liveAssets === DATA.ASSETS) return DATA.ALLOCATION;
    const totals = {};
    for (const a of liveAssets) {
      const rawType = 'symbol_or_name' in a ? a.asset_type : a.type;
      const key = ['etf', 'stock', 'bond'].includes(rawType) ? 'stocks'
        : rawType === 'real_estate' ? 'realestate'
        : rawType === 'crypto' ? 'crypto'
        : rawType === 'gold' ? 'gold'
        : 'cash';
      const val = (('current_value' in a ? a.current_value : a.qty * a.price) ?? 0)
        * (('ownership_pct' in a ? a.ownership_pct : a.ownership) ?? 100) / 100;
      totals[key] = (totals[key] ?? 0) + val;
    }
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ key, value, ...(ALLOC_META[key] ?? { label: key, color: '#888' }) }))
      .sort((a, b) => b.value - a.value);
  }, [liveAssets]);

  return (
    <div className="page rise">
      <div className="page-h">
        <h1>Accounts & Net Worth</h1>
        <span className="sub">{liveAccounts.filter(a => a.is_active).length} active accounts · {currency} base</span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn ghost sm" onClick={() => setShowCreateModal(true)}>
            <Icon n="plus" s={15} />Add account
          </button>
        </div>
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
            <Donut segments={liveAllocation.map(a => ({ value: a.value, color: a.color, label: a.label }))} size={176} stroke={25}
              center={<><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{MC(endV)}</div><div className="kpi-sub">net worth</div></>} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {liveAllocation.map(a => (
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
          {liveAccounts.map(a => (
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

      {showCreateModal && (
        <CreateAccountModal
          onClose={() => setShowCreateModal(false)}
          onCreated={account => {
            setLiveAccounts(prev => [...prev, {
              id: account.id,
              name: account.name,
              type: account.type,
              orig_cur: account.currency,
              cls: typeToClass(account.type),
              base: 0,
              orig_bal: 0,
              is_active: account.is_active,
            }]);
          }}
        />
      )}

      {assetModal && (
        <AssetModal
          initial={assetModal}
          accounts={liveAccounts}
          onClose={() => setAssetModal(null)}
          onSaved={() => { setAssetModal(null); getAssets().then(setLiveAssets).catch(() => {}); }}
        />
      )}

      {/* PER-ASSET PERFORMANCE */}
      <section className="card">
        <div className="card-h">
          <div className="t"><b>Holdings</b> · performance</div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setAssetModal({})}>
            <Icon n="plus" s={15} />Add asset
          </button>
        </div>
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

function AssetModal({ initial, accounts, onClose, onSaved }) {
  const editing = !!(initial && initial.id);
  const [name, setName] = useState(initial.symbol_or_name || '');
  const [type, setType] = useState(initial.asset_type || 'stocks');
  const [value, setValue] = useState(initial.current_value ?? '');
  const [ownership, setOwnership] = useState(initial.ownership_pct ?? 100);
  const [assetCurrency, setAssetCurrency] = useState(initial.currency || 'EUR');
  const [accountId, setAccountId] = useState(initial.account_id || (accounts[0] && accounts[0].id) || 1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const v = parseFloat(value), o = parseFloat(ownership);
    if (!name.trim()) { setError('Name is required'); return; }
    if (Number.isNaN(v)) { setError('Value must be a number'); return; }
    if (Number.isNaN(o) || o < 0 || o > 100) { setError('Ownership must be 0–100'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        account_id: Number(accountId),
        symbol_or_name: name.trim(),
        asset_type: type,
        current_value: v,
        ownership_pct: o,
        currency: assetCurrency.trim() || 'EUR',
        quantity: 1,
      };
      const saved = editing ? await updateAsset(initial.id, payload) : await createAsset(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Could not connect to server');
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 11, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon n="wallet" s={20} c="var(--accent)" />
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{editing ? 'Edit asset' : 'New asset'}</div>
            <div className="kpi-sub">A holding that counts toward net worth</div>
          </div>
          <button className="btn icon" style={{ marginLeft: 'auto', padding: 4, background: 'transparent', border: 0 }} onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="fld">Name *</label>
            <input className="inp" placeholder="e.g. Stuttgart apartment" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="fld">Type</label>
            <select className="inp" value={type} onChange={e => setType(e.target.value)}>
              {[['stocks', 'Stocks & ETFs'], ['realestate', 'Real estate'], ['crypto', 'Crypto'], ['gold', 'Gold'], ['cash', 'Cash'], ['other', 'Other']].map(([v, l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>
          </div>
          <div>
            <label className="fld">Current value</label>
            <input className="inp mono" placeholder="236000" value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div>
            <label className="fld">Ownership %</label>
            <input className="inp mono" placeholder="100" value={ownership} onChange={e => setOwnership(e.target.value)} />
          </div>
          <div>
            <label className="fld">Account</label>
            <select className="inp" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--neg)', fontWeight: 600 }}>{error}</div>}

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : editing ? 'Save asset' : 'Add asset'}
          </button>
        </div>
      </div>
    </div>
  );
}


function CreateAccountModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [acctCurrency, setAcctCurrency] = useState('EUR');
  const [institution, setInstitution] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const account = await createAccount({
        name: name.trim(),
        type,
        currency: acctCurrency.trim() || 'EUR',
        institution: institution.trim() || undefined,
      });
      onCreated(account);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not connect to server');
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 11, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon n="wallet" s={20} c="var(--accent)" />
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>New account</div>
            <div className="kpi-sub">Add a bank, brokerage, or asset account</div>
          </div>
          <button className="btn icon" style={{ marginLeft: 'auto', padding: 4, background: 'transparent', border: 0 }} onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="fld">Name *</label>
            <input className="inp" placeholder="e.g. Comdirect Checking" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="fld">Type</label>
            <select className="inp" value={type} onChange={e => setType(e.target.value)}>
              {[['bank', 'Bank'], ['brokerage', 'Brokerage'], ['crypto', 'Crypto'], ['realestate', 'Real estate'], ['gold', 'Gold']].map(([v, l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>
          </div>
          <div>
            <label className="fld">Currency</label>
            <input className="inp mono" placeholder="EUR" value={acctCurrency} onChange={e => setAcctCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div>
            <label className="fld">Institution <span className="fx">(optional)</span></label>
            <input className="inp" placeholder="e.g. Deutsche Bank" value={institution} onChange={e => setInstitution(e.target.value)} />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--neg)', fontWeight: 600 }}>{error}</div>}

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}
