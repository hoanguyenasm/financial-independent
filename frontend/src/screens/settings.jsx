/* ============================================================
   Screen — Import & Settings  (two tabs)
   ============================================================ */
/* eslint-disable */
import { useState, useEffect } from 'react';
import { DATA, FMT, FX } from '../data.js';
import { Icon, Avatar, useToast } from '../ui.jsx';

export function SettingsScreen({ go, currency, setCurrency, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'import');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
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
function ImportTab() {
  const [acct, setAcct] = useState('comdirect');
  const [phase, setPhase] = useState('idle');     // idle | preview
  const [over, setOver] = useState(false);
  const [file, setFile] = useState(null);
  const [history, setHistory] = useState(DATA.IMPORTS);
  const [toast, showToast] = useToast();

  const previewRows = [
    { date: '10 Jun', desc: 'REWE SAGT DANKE', amt: -42.80, cur: 'EUR', cat: 'supermarket', dupe: false },
    { date: '9 Jun', desc: 'DEUTSCHE BAHN ICE', amt: -59.00, cur: 'EUR', cat: 'travel', dupe: false },
    { date: '9 Jun', desc: 'PAYPAL *DIGISTORE24', amt: -29.90, cur: 'EUR', cat: null, dupe: false },
    { date: '8 Jun', desc: 'AIRBNB PAYMENTS', amt: 1180.00, cur: 'EUR', cat: 'airbnb', dupe: false },
    { date: '8 Jun', desc: 'NETFLIX.COM', amt: -17.99, cur: 'EUR', cat: 'abo', dupe: true },
    { date: '7 Jun', desc: 'SEPA-LASTSCHRIFT VISA 4471', amt: -84.50, cur: 'EUR', cat: null, dupe: false },
  ];
  const startUpload = (name) => { setFile(name || 'comdirect_2026_06.pdf'); setPhase('preview'); };
  const confirm = () => {
    setHistory(h => [{ id: Date.now(), file, acct, date: '12 Jun 2026', rows: 44, status: 'success', dupes: 3 }, ...h]);
    showToast('Imported 44 transactions · 12 need review', 'check');
    setPhase('idle'); setFile(null);
  };

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', marginBottom: 22, alignItems: 'start' }}>
        {phase === 'idle' ? (
          <div className={'dropzone' + (over ? ' over' : '')}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); startUpload(e.dataTransfer.files[0]?.name); }}
            onClick={() => startUpload()}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Icon n="upload" s={26} c="var(--accent)" /></span>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Drop a PDF or CSV statement here</div>
            <div className="kpi-sub" style={{ marginBottom: 4 }}>or click to browse · Comdirect, ING, Trade Republic, Scalable, Revolut supported</div>
            <div className="fx">We never store your bank credentials</div>
          </div>
        ) : (
          <div className="card fade-in">
            <div className="spread" style={{ marginBottom: 16 }}>
              <div className="row" style={{ gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="doc" s={19} c="var(--accent)" /></span>
                <div><div style={{ fontWeight: 800, fontSize: 14 }}>{file}</div><div className="fx">→ {DATA.ACCT[acct].name}</div></div>
              </div>
              <button className="btn ghost icon" onClick={() => setPhase('idle')}><Icon n="x" s={16} /></button>
            </div>
            <div className="gridcols-3" style={{ marginBottom: 18 }}>
              <PreviewStat n="44" label="transactions found" color="var(--accent)" />
              <PreviewStat n="3" label="duplicates skipped" color="var(--text-2)" />
              <PreviewStat n="12" label="uncategorized" color="var(--warn)" />
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th><th className="c">Status</th></tr></thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} style={r.dupe ? { opacity: .45 } : {}}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.desc}</td>
                      <td>{r.cat ? <span className="catcell" style={{ color: FMT.catColor(r.cat) }}><span className="dot-c" style={{ background: FMT.catColor(r.cat) }} />{FMT.catName(r.cat)}</span> : <span className="catcell empty"><Icon n="alert" s={12} />Uncategorized</span>}</td>
                      <td className="r mono" style={{ fontWeight: 700, color: r.amt >= 0 ? 'var(--pos)' : 'var(--text)' }}>{FMT.orig(r.cur, r.amt)}</td>
                      <td className="c">{r.dupe ? <span className="tag ghost sm">duplicate</span> : <span className="tag pos sm">new</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setPhase('idle')}>Cancel</button>
              <button className="btn primary" onClick={confirm}><Icon n="check" s={15} c="#04121d" />Confirm import · 44 rows</button>
            </div>
          </div>
        )}

        <div className="card tight">
          <label className="fld">Target account</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {DATA.ACCOUNTS.filter(a => a.is_active).map(a => (
              <button key={a.id} className="dd-item" onClick={() => setAcct(a.id)}
                style={{ border: '1px solid ' + (acct === a.id ? 'var(--accent)' : 'var(--border)'), background: acct === a.id ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${a.cls})` }} /><span style={{ flex: 1 }}>{a.name}</span>{acct === a.id && <Icon n="check" s={14} c="var(--accent)" />}
              </button>
            ))}
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
                  <td><div className="row" style={{ gap: 9 }}><Icon n="doc" s={15} c="var(--text-3)" /><span style={{ fontWeight: 600 }}>{h.file}</span></div></td>
                  <td className="t2" style={{ fontSize: 12.5 }}>{DATA.ACCT[h.acct] ? DATA.ACCT[h.acct].name : '—'}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{h.date}</td>
                  <td className="r mono" style={{ fontWeight: 700 }}>{h.rows || '—'}</td>
                  <td className="c">
                    <span className={'tag sm ' + (h.status === 'success' ? 'pos' : h.status === 'partial' ? 'warn' : 'neg')} title={h.note || ''}>
                      {h.status === 'success' ? 'success' : h.status === 'partial' ? 'partial' : 'failed'}{h.dupes ? ` · ${h.dupes} dupes` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {toast}
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
            <button key={c} className={'btn ' + (currency === c ? 'primary' : 'ghost') + ' sm'} onClick={() => setCurrency(c)}>{FX.sym[c]} {c}</button>
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
              <div className="row" style={{ gap: 10 }}><span className="fx">{r.hits} matches</span><button className="btn icon" style={{ padding: 4, background: 'transparent', border: 0 }} onClick={() => setRules(list => list.filter(x => x.id !== r.id))}><Icon n="trash" s={15} c="var(--text-3)" /></button></div>
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
