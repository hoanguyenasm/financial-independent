/* ============================================================
   Screen — Import & Settings  (two tabs)
   ============================================================ */
/* eslint-disable */
import { useState, useEffect } from 'react';
import { DATA, FMT, FX } from '../data.js';
import { Icon, Avatar, useToast } from '../ui.jsx';
import { getSettings, updateSettings, deleteCategoryRule, importFile, getImportLogs, getAccounts } from '../lib/api.ts';

export function SettingsScreen({ go, currency, setCurrency, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'import');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  // sync base currency from backend when it is reachable; mock mode otherwise
  useEffect(() => { getSettings().then(s => s.base_currency && setCurrency(s.base_currency)).catch(() => {}); }, []);
  return (
    <div className="page rise" style={{ maxWidth: 1100 }}>
      <div className="page-h">
        <h1>Import & Settings</h1>
        <div className="tabs" style={{ marginLeft: 'auto' }}>
          <button className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>Import</button>
          <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
        </div>
      </div>
      {tab === 'import' ? <ImportTab /> : <SettingsTab currency={currency} setCurrency={setCurrency} />}
    </div>
  );
}

/* ---------------- IMPORT ---------------- */
function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}

function ImportTab() {
  const [phase, setPhase] = useState('idle');     // idle | uploading | result
  const [over, setOver] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(DATA.IMPORTS);
  const [, showToast] = useToast();

  const defaultAccounts = DATA.ACCOUNTS.filter(a => a.is_active);
  const [accounts, setAccounts] = useState(defaultAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccounts.length > 0 ? defaultAccounts[0].id : null
  );

  useEffect(() => {
    getAccounts(true).then(data => {
      if (data.length > 0) {
        const adapted = data.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          cls: typeToClass(a.type),
          is_active: a.is_active,
        }));
        setAccounts(adapted);
        setSelectedAccountId(adapted[0].id);
      }
    }).catch(() => {});
  }, []);

  const loadHistory = () =>
    getImportLogs().then(setHistory).catch(() => {});

  useEffect(() => { loadHistory(); }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setPhase('uploading');
    try {
      const log = await importFile(file, selectedAccountId ?? 1, 1);
      setResult(log);
      setPhase('result');
      showToast(`Imported ${log.rows_imported} transactions · ${log.rows_uncategorized} need review`, 'check');
      loadHistory();
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'x');
      setPhase('idle');
    }
  };

  const reset = () => { setPhase('idle'); setResult(null); };

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', marginBottom: 22, alignItems: 'start' }}>
        {phase === 'idle' && (
          <div className={'dropzone' + (over ? ' over' : '')}
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files?.[0]); }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon n="upload" s={26} c="var(--accent)" />
            </span>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Drop a PDF or CSV statement here</div>
            <div className="kpi-sub" style={{ marginBottom: 4 }}>or click to browse · Comdirect, ING, Trade Republic, Scalable, Revolut supported</div>
            <div className="fx">We never store your bank credentials</div>
            <input type="file" accept=".csv,.pdf" style={{ display: 'none' }}
              id="import-file-input"
              onChange={e => handleFile(e.target.files?.[0])} />
            <button className="btn ghost" style={{ marginTop: 14 }}
              onClick={e => { e.stopPropagation(); document.getElementById('import-file-input').click(); }}>
              Browse files
            </button>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="card fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Uploading & parsing…</div>
              <div className="fx">Applying category rules and checking for duplicates</div>
            </div>
          </div>
        )}

        {phase === 'result' && result && (
          <div className="card fade-in">
            <div className="spread" style={{ marginBottom: 16 }}>
              <div className="row" style={{ gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon n="doc" s={19} c="var(--accent)" />
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{result.filename}</div>
                  <div className="fx">{result.source_type.toUpperCase()} · {new Date(result.imported_at).toLocaleString()}</div>
                </div>
              </div>
              <button className="btn ghost icon" onClick={reset}><Icon n="x" s={16} /></button>
            </div>
            <div className="gridcols-3" style={{ marginBottom: 18 }}>
              <PreviewStat n={result.rows_imported} label="imported" color="var(--pos)" />
              <PreviewStat n={result.rows_skipped} label="duplicates skipped" color="var(--text-2)" />
              <PreviewStat n={result.rows_uncategorized} label="need review" color="var(--warn)" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={reset}><Icon n="upload" s={15} c="#04121d" />Import another</button>
            </div>
          </div>
        )}

        <div className="card tight">
          <label className="fld">Target account</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {accounts.map(a => (
              <button key={a.id} className="dd-item"
                onClick={() => setSelectedAccountId(a.id)}
                style={{
                  border: `1px solid ${a.id === selectedAccountId ? 'var(--accent)' : 'var(--border)'}`,
                  background: a.id === selectedAccountId ? 'var(--accent-soft)' : 'var(--surface-2)',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${a.cls})` }} />
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.id === selectedAccountId && <Icon n="check" s={14} c="var(--accent)" />}
              </button>
            ))}
            {accounts.length === 0 && (
              <div className="fx" style={{ padding: '8px 4px' }}>No accounts found. Create one first.</div>
            )}
          </div>
        </div>
      </div>

      {/* HISTORY */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Import history</b></div></div>
        <div className="tbl-wrap" style={{ border: 'none' }}>
          <table className="tbl">
            <thead><tr><th>File</th><th>Account</th><th>Date</th><th className="r">Rows</th><th className="c">Status</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td><div className="row" style={{ gap: 9 }}><Icon n="doc" s={15} c="var(--text-3)" /><span style={{ fontWeight: 600 }}>{h.file || h.filename}</span></div></td>
                  <td className="t2" style={{ fontSize: 12.5 }}>{h.acct ? (DATA.ACCT[h.acct] ? DATA.ACCT[h.acct].name : h.acct) : `Account ${h.account_id}`}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{h.date || (h.imported_at ? new Date(h.imported_at).toLocaleDateString() : '—')}</td>
                  <td className="r mono" style={{ fontWeight: 700 }}>{h.rows || h.rows_imported || '—'}</td>
                  <td className="c">
                    <span className={'tag sm ' + (h.status === 'success' || h.status === 'done' ? 'pos' : h.status === 'partial' ? 'warn' : 'neg')}>{h.status || 'done'}</span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0' }}>No imports yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function PreviewStat({ n, label, color }) {
  return <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
    <div className="num" style={{ fontSize: 28, fontWeight: 800, color }}>{n}</div><div className="kpi-sub">{label}</div></div>;
}

/* ---------------- SETTINGS ---------------- */
function SettingsTab({ currency, setCurrency }) {
  const [cats, setCats] = useState(DATA.CATEGORIES);
  const [rules, setRules] = useState(DATA.RULES);
  const [goal, setGoal] = useState({ target: 1500000, date: '2037-01', swr: 3.5, ret: 5.0, infl: 2.0 });
  const [fx, setFx] = useState({ USD: 0.92, VND: 27800 });
  const [newCat, setNewCat] = useState('');
  const [toast, showToast] = useToast();
  const u = DATA.USERS;

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
      {/* PROFILES */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Household members</b></div></div>
        {[u.you, u.partner].map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 13, marginBottom: 16 }}>
            <Avatar user={p.id} size={42} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label className="fld">Name</label><input className="inp" defaultValue={p.name} /></div>
              <div><label className="fld">Email</label><input className="inp" defaultValue={p.email} /></div>
            </div>
          </div>
        ))}
        <div className="sep" />
        <label className="fld">Household base currency</label>
        <div className="row" style={{ gap: 8 }}>
          {['EUR', 'USD', 'VND'].map(c => (
            <button key={c} className={'btn ' + (currency === c ? 'primary' : 'ghost') + ' sm'} onClick={() => { setCurrency(c); updateSettings(c).catch(() => {}); }}>{FX.sym[c]} {c}</button>
          ))}
          <span className="kpi-sub" style={{ marginLeft: 'auto' }}>All figures convert instantly</span>
        </div>
      </section>

      {/* FIRE GOALS */}
      <section className="card">
        <div className="card-h"><Icon n="bolt" s={16} c="var(--accent)" /><div className="t"><b>FIRE goal</b></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="fld">Target net worth</label><input className="inp mono" value={'€' + goal.target.toLocaleString()} onChange={e => setGoal(g => ({ ...g, target: +e.target.value.replace(/\D/g, '') || 0 }))} /></div>
          <div><label className="fld">Target date</label><input className="inp" type="month" value={goal.date} onChange={e => setGoal(g => ({ ...g, date: e.target.value }))} /></div>
          <div><label className="fld">Safe withdrawal rate</label><div style={{ position: 'relative' }}><input className="inp mono" value={goal.swr} onChange={e => setGoal(g => ({ ...g, swr: e.target.value }))} /><span style={{ position: 'absolute', right: 12, top: 9, color: 'var(--text-3)' }}>%</span></div></div>
          <div><label className="fld">Investment return</label><div style={{ position: 'relative' }}><input className="inp mono" value={goal.ret} onChange={e => setGoal(g => ({ ...g, ret: e.target.value }))} /><span style={{ position: 'absolute', right: 12, top: 9, color: 'var(--text-3)' }}>%</span></div></div>
          <div><label className="fld">Inflation rate</label><div style={{ position: 'relative' }}><input className="inp mono" value={goal.infl} onChange={e => setGoal(g => ({ ...g, infl: e.target.value }))} /><span style={{ position: 'absolute', right: 12, top: 9, color: 'var(--text-3)' }}>%</span></div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast('FIRE goal updated')}>Save goal</button></div>
        </div>
        <div className="fx" style={{ marginTop: 12 }}>SWR {goal.swr}% implies a {FMT.eur(Math.round(goal.target * goal.swr / 100 / 12))}/mo safe income at target.</div>
      </section>

      {/* CATEGORIES */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Categories</b></div><span className="kpi-sub" style={{ marginLeft: 'auto' }}>{cats.length}</span></div>
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input className="inp" placeholder="New category name…" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newCat.trim()) { setCats(c => [...c, { id: 'c' + Date.now(), name: newCat.trim(), kind: 'expense', color: '#818CF8' }]); setNewCat(''); showToast('Category added'); } }} />
          <button className="btn primary" disabled={!newCat.trim()} onClick={() => { setCats(c => [...c, { id: 'c' + Date.now(), name: newCat.trim(), kind: 'expense', color: '#818CF8' }]); setNewCat(''); showToast('Category added'); }}><Icon n="plus" s={15} c="#04121d" /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {cats.map(c => (
            <span key={c.id} className="row" style={{ gap: 7, padding: '6px 8px 6px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: c.color }} />{c.name}
              <button className="btn icon" style={{ padding: 2, background: 'transparent', border: 0 }} onClick={() => setCats(list => list.filter(x => x.id !== c.id))}><Icon n="x" s={13} c="var(--text-3)" /></button>
            </span>
          ))}
        </div>
      </section>

      {/* RULES + FX */}
      <section className="card">
        <div className="card-h"><div className="t"><b>Auto-categorization rules</b></div></div>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18 }}>
          {rules.map((r, i) => (
            <div key={r.id} className="spread" style={{ padding: '9px 4px', borderBottom: i < rules.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="row" style={{ gap: 9 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>{r.match}</span>
                <Icon n="arrowR" s={13} c="var(--text-3)" />
                <span className="catcell" style={{ color: FMT.catColor(r.cat) }}><span className="dot-c" style={{ background: FMT.catColor(r.cat) }} />{FMT.catName(r.cat)}</span>
              </div>
              <div className="row" style={{ gap: 10 }}><span className="fx">{r.hits} matches</span><button className="btn icon" style={{ padding: 4, background: 'transparent', border: 0 }} onClick={() => { setRules(list => list.filter(x => x.id !== r.id)); deleteCategoryRule(r.id).catch(() => {}); }}><Icon n="trash" s={15} c="var(--text-3)" /></button></div>
            </div>
          ))}
        </div>
        <div className="sep" />
        <div className="card-h" style={{ marginTop: 4 }}><div className="t"><b>FX rate override</b></div><span className="fx" style={{ marginLeft: 'auto' }}>1 EUR =</span></div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}><label className="fld">US Dollar</label><input className="inp mono" value={fx.USD} onChange={e => setFx(f => ({ ...f, USD: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><label className="fld">Vietnamese đồng</label><input className="inp mono" value={fx.VND} onChange={e => setFx(f => ({ ...f, VND: e.target.value }))} /></div>
          <button className="btn ghost" style={{ alignSelf: 'flex-end' }} onClick={() => showToast('FX rates overridden')}>Apply</button>
        </div>
      </section>
      {toast}
    </div>
  );
}
