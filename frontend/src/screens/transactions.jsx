/* ============================================================
   Screen — Transactions (inline edit, bulk, filters, pagination)
   ============================================================ */
/* eslint-disable */
import { useState, useEffect, useMemo, useRef } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Avatar, Check, Dropdown, DDItem, useToast } from '../ui.jsx';
import { patchTransaction, createCategoryRule, getAccounts, getTransactions } from '../lib/api.ts';

function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}

export function TransactionsScreen({ go, currency, household, initialFilter, registerSetReview, myUserId = 1 }) {
  const [tx, setTx] = useState(() => DATA.TX.map(t => ({ ...t })));
  const [accounts, setAccounts] = useState(DATA.ACCOUNTS);
  const acctMap = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts]
  );
  const partnerUserId = useMemo(() => {
    const other = tx.find(t => t.user_id !== myUserId);
    return other ? other.user_id : (myUserId === 1 ? 2 : 1);
  }, [tx, myUserId]);
  const [q, setQ] = useState('');
  const [fAcct, setFAcct] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fUser, setFUser] = useState('all');
  const [fRange, setFRange] = useState('90');
  const last6Months = useMemo(() => {
    const months = [];
    const d = new Date(DATA.TODAY);
    for (let i = 0; i < 6; i++) {
      months.push({ value: `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) });
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  }, []);
  const [needsReview, setNeedsReview] = useState(!!(initialFilter && initialFilter.needsReview));
  const [sel, setSel] = useState(() => new Set());
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(null);       // {ids:[], x, y, bulk}
  const [rulePrompt, setRulePrompt] = useState(null); // {desc, catId}
  const [toast, showToast] = useToast();
  const pageSize = 11;

  useEffect(() => { if (initialFilter && initialFilter.needsReview) setNeedsReview(true); }, [initialFilter]);
  const reviewCount = tx.filter(t => t.needs_review).length;
  useEffect(() => { registerSetReview && registerSetReview(reviewCount); }, [reviewCount]);

  useEffect(() => {
    getAccounts().then(data => {
      if (data.length > 0) {
        setAccounts(data.map(a => ({
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
  }, []);

  useEffect(() => {
    getTransactions(500).then(data => {
      if (data.length > 0) {
        setTx(data.map(t => ({
          ...t,
          d: new Date(t.date),
          desc: t.description,
          amount_base: t.amount_base ?? t.amount,
        })));
      }
    }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const cut = fRange !== 'all' && !fRange.startsWith('m:')
      ? (new Date(DATA.TODAY), (() => { const d = new Date(DATA.TODAY); d.setDate(d.getDate() - +fRange); return d; })())
      : null;
    return tx.filter(t => {
      if (needsReview && !t.needs_review) return false;
      if (fAcct !== 'all' && t.account_id !== fAcct) return false;
      if (fCat !== 'all' && t.category !== fCat) return false;
      if (fUser !== 'all') {
        const resolvedUser = fUser === 'you' ? myUserId : partnerUserId;
        if (t.user_id !== resolvedUser) return false;
      }
      if (household !== 'household') {
        const resolvedHousehold = household === 'you' ? myUserId : partnerUserId;
        if (t.user_id !== resolvedHousehold) return false;
      }
      if (fRange.startsWith('m:')) {
        const [y, mo] = fRange.slice(2).split('-').map(Number);
        if (t.d.getFullYear() !== y || t.d.getMonth() + 1 !== mo) return false;
      } else if (cut && t.d < cut) return false;
      if (q && !(t.desc.toLowerCase().includes(q.toLowerCase()) || (FMT.catName(t.category) || '').toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [tx, q, fAcct, fCat, fUser, fRange, needsReview, household]);

  useEffect(() => { setPage(0); }, [q, fAcct, fCat, fUser, fRange, needsReview, household]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const allSel = view.length > 0 && view.every(t => sel.has(t.id));
  const someSel = view.some(t => sel.has(t.id));
  const toggleAll = () => setSel(s => { const n = new Set(s); if (allSel) view.forEach(t => n.delete(t.id)); else view.forEach(t => n.add(t.id)); return n; });
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function applyCat(ids, catId) {
    setTx(list => list.map(t => ids.includes(t.id) ? { ...t, category: catId, needs_review: false } : t));
    // best-effort sync to the backend; mock ids ('tx1003') have no DB row yet
    ids.forEach(id => {
      const n = parseInt(String(id).replace(/\D/g, ''), 10);
      if (!Number.isNaN(n)) patchTransaction(n, { category: catId, needs_review: false }).catch(() => {});
    });
  }
  function onPickCat(catId) {
    const ids = menu.ids;
    applyCat(ids, catId);
    if (!menu.bulk && ids.length === 1) {
      const t = tx.find(x => x.id === ids[0]);
      setRulePrompt({ desc: t.desc, catId, count: ids.length });
    } else {
      showToast(`${ids.length} transactions set to ${FMT.catName(catId)}`);
    }
    setMenu(null); setSel(new Set());
  }
  const activeFilters = (fAcct !== 'all') + (fCat !== 'all') + (fUser !== 'all') + (needsReview ? 1 : 0);

  return (
    <div className="page rise" style={{ maxWidth: 1560 }}>
      <div className="page-h">
        <h1>Transactions</h1>
        <span className="sub">{filtered.length} of {tx.length} · {reviewCount} need review</span>
        <div style={{ marginLeft: 'auto' }}><button className="btn ghost sm" onClick={() => go('settings', { tab: 'import' })}><Icon n="upload" s={15} />Import statement</button></div>
      </div>

      {/* FILTER BAR */}
      <div className="filterbar">
        <div className="search">
          <Icon n="search" s={15} />
          <input className="inp" placeholder="Search description or category…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className={'dd-btn' + (needsReview ? ' on-review' : '')} onClick={() => setNeedsReview(v => !v)}
          style={needsReview ? { background: 'var(--warn-soft)', borderColor: 'rgba(251,191,36,.4)', color: 'var(--warn)' } : {}}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: needsReview ? 'var(--warn)' : 'var(--text-3)' }} />Needs review
        </button>
        <Dropdown label="Account" display={fAcct === 'all' ? 'All' : (acctMap[fAcct]?.name ?? 'Account')}>
          <DDItem on={fAcct === 'all'} onClick={() => setFAcct('all')}>All accounts</DDItem>
          <div className="dd-sep" />
          {accounts.filter(a => a.is_active).map(a => <DDItem key={a.id} on={fAcct === a.id} onClick={() => setFAcct(a.id)}>{a.name}</DDItem>)}
        </Dropdown>
        <Dropdown label="Category" display={fCat === 'all' ? 'All' : FMT.catName(fCat)}>
          <DDItem on={fCat === 'all'} onClick={() => setFCat('all')}>All categories</DDItem>
          <div className="dd-sep" />
          {DATA.CATEGORIES.map(c => <DDItem key={c.id} on={fCat === c.id} onClick={() => setFCat(c.id)} dot={c.color}>{c.name}</DDItem>)}
        </Dropdown>
        <Dropdown label="User" display={fUser === 'all' ? 'Household' : DATA.USERS[fUser].name}>
          <DDItem on={fUser === 'all'} onClick={() => setFUser('all')}>Household</DDItem>
          <DDItem on={fUser === 'you'} onClick={() => setFUser('you')} dot="var(--you)">{DATA.USERS.you.name} (You)</DDItem>
          <DDItem on={fUser === 'partner'} onClick={() => setFUser('partner')} dot="var(--partner)">{DATA.USERS.partner.name} (Partner)</DDItem>
        </Dropdown>
        <Dropdown label="Period" display={
          fRange === 'all' ? 'All time' :
          fRange === '30' ? 'Last 30 days' :
          fRange === '90' ? 'Last 90 days' :
          fRange === '365' ? 'Last 12 months' :
          (last6Months.find(m => m.value === fRange)?.label ?? 'Period')
        }>
          {[['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['all', 'All time']].map(([v, l]) =>
            <DDItem key={v} on={fRange === v} onClick={() => setFRange(v)}>{l}</DDItem>)}
          <div className="dd-sep" />
          {last6Months.map(m =>
            <DDItem key={m.value} on={fRange === m.value} onClick={() => setFRange(m.value)}>{m.label}</DDItem>)}
        </Dropdown>
        {activeFilters > 0 && <button className="dd-btn" onClick={() => { setFAcct('all'); setFCat('all'); setFUser('all'); setNeedsReview(false); }}><Icon n="x" s={13} />Clear</button>}
      </div>

      {/* BULK BAR */}
      {sel.size > 0 && (
        <div className="card tight fade-in" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', marginBottom: 14, borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
          <b style={{ fontSize: 14 }}>{sel.size} selected</b>
          <button className="btn primary sm" onClick={e => setMenu({ ids: [...sel], x: e.clientX, y: e.clientY + 10, bulk: true })}><Icon n="edit" s={14} c="#04121d" />Re-categorize</button>
          <button className="btn ghost sm" onClick={() => { applyCat([...sel], 'other'); showToast(sel.size + ' marked reviewed'); setSel(new Set()); }}>Mark reviewed</button>
          <button className="dd-btn" style={{ marginLeft: 'auto' }} onClick={() => setSel(new Set())}><Icon n="x" s={13} />Clear</button>
        </div>
      )}

      {/* TABLE */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 42 }}><Check on={allSel} indeterminate={someSel && !allSel} onChange={toggleAll} /></th>
              <th style={{ width: 90 }}>Date</th>
              <th>Description</th>
              <th style={{ width: 190 }}>Category</th>
              <th className="r" style={{ width: 150 }}>Amount</th>
              <th className="r" style={{ width: 130 }}>Base ({currency})</th>
              <th style={{ width: 150 }}>Account</th>
              <th className="c" style={{ width: 70 }}>User</th>
            </tr>
          </thead>
          <tbody>
            {view.map(t => (
              <tr key={t.id} className={sel.has(t.id) ? 'sel' : ''}>
                <td><Check on={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                <td className="mono" style={{ color: 'var(--text-2)', fontSize: 12 }}>{FMT.fmtDay(t.d)}</td>
                <td style={{ fontWeight: 600, whiteSpace: 'normal', maxWidth: 340 }}>
                  {t.desc}
                  {t.needs_review && <span className="tag warn sm" style={{ marginLeft: 8 }}>new</span>}
                </td>
                <td>
                  <span className={'catcell' + (t.category ? '' : ' empty')}
                    style={t.category ? { color: FMT.catColor(t.category) } : {}}
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ ids: [t.id], x: r.left, y: r.bottom + 4, bulk: false }); }}>
                    {t.category ? <><span className="dot-c" style={{ background: FMT.catColor(t.category) }} />{FMT.catName(t.category)}</>
                      : <><Icon n="alert" s={13} />Categorize</>}
                    <Icon n="chev" s={12} style={{ opacity: .5 }} />
                  </span>
                </td>
                <td className="r mono" style={{ fontWeight: 700, color: t.amount >= 0 ? 'var(--pos)' : 'var(--text)' }}>{FMT.orig(t.currency, t.amount)}</td>
                <td className="r mono" style={{ color: t.amount_base >= 0 ? 'var(--pos)' : 'var(--text-2)', fontSize: 12 }}>{FMT.display(currency, t.amount_base, currency === 'VND' ? 0 : 2)}</td>
                <td><span className="row" style={{ gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ width: 7, height: 7, borderRadius: 2, background: `var(--c-${acctMap[t.account_id]?.cls ?? 'other'})` }} />{acctMap[t.account_id]?.name ?? 'Unknown'}</span></td>
                <td className="c"><Avatar user={t.user_id === myUserId ? 'you' : 'partner'} size={22} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>No transactions match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="spread" style={{ marginTop: 14 }}>
        <span className="kpi-sub">Showing {filtered.length === 0 ? 0 : page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}><Icon n="chev" s={16} style={{ transform: 'rotate(90deg)' }} /></button>
          {Array.from({ length: pages }).slice(0, 7).map((_, i) => (
            <button key={i} className={'btn ' + (i === page ? 'primary' : 'ghost') + ' sm'} style={{ minWidth: 34, justifyContent: 'center' }} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button className="btn ghost icon" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}><Icon n="chev" s={16} style={{ transform: 'rotate(-90deg)' }} /></button>
        </div>
      </div>

      {/* FLOATING CATEGORY MENU */}
      {menu && <CatMenu x={menu.x} y={menu.y} bulk={menu.bulk} count={menu.ids.length} onPick={onPickCat} onClose={() => setMenu(null)} />}

      {/* ALWAYS-CATEGORIZE PROMPT */}
      {rulePrompt && (
        <div className="scrim" onClick={() => setRulePrompt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="row" style={{ gap: 11, marginBottom: 14 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="bolt" s={20} c="var(--accent)" /></span>
              <div><div style={{ fontSize: 16, fontWeight: 800 }}>Create a rule?</div><div className="kpi-sub">Auto-categorize future matches</div></div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 20px' }}>
              Always categorize transactions matching <b style={{ color: 'var(--text)' }}>“{rulePrompt.desc}”</b> as{' '}
              <span style={{ color: FMT.catColor(rulePrompt.catId), fontWeight: 700 }}>{FMT.catName(rulePrompt.catId)}</span>?
            </p>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => { showToast('Categorized once'); setRulePrompt(null); }}>No, just this one</button>
              <button className="btn primary" onClick={() => { createCategoryRule(rulePrompt.desc, rulePrompt.catId).catch(() => {}); showToast('Rule created · future matches auto-categorized', 'bolt'); setRulePrompt(null); }}>Yes, always</button>
            </div>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

function CatMenu({ x, y, onPick, onClose, bulk, count }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, []);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 380);
  return (
    <div ref={ref} className="dd-menu" style={{ position: 'fixed', left, top, minWidth: 210, maxHeight: 360, overflowY: 'auto', zIndex: 130 }}>
      {bulk && <div className="kpi-sub" style={{ padding: '4px 10px 8px' }}>Apply to {count} selected</div>}
      {DATA.CATEGORIES.map(c => (
        <button key={c.id} className="dd-item" onClick={() => onPick(c.id)}>
          <span className="dot-c" style={{ background: c.color }} /><span style={{ flex: 1 }}>{c.name}</span>
          <span className="fx" style={{ textTransform: 'capitalize' }}>{c.kind}</span>
        </button>
      ))}
    </div>
  );
}
