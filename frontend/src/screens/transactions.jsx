/* ============================================================
   Screen — Transactions (inline edit, bulk, filters, pagination)
   ============================================================ */
/* eslint-disable */
import { useState, useEffect, useMemo, useRef } from 'react';
import { DATA, FMT } from '../data.js';
import { Icon, Avatar, Check, Dropdown, DDItem, useToast } from '../ui.jsx';
import { patchTransaction, createCategoryRule, getAccounts, getTransactions } from '../lib/api.ts';
import { saveCache, loadCache } from '../lib/cache.ts';

function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}

/* Guess a reusable keyword from a bank description so a rule matches future
   siblings across accounts. The merchant name is the stable part; order ids,
   store numbers, and reference codes differ every time and must be dropped.
     Comdirect:  "Auftraggeber: <merchant> Buchungstext: …"
     AmEx:       "AMZN MKTP DE*NN05V5WN4 AMZN.COM/BILL" -> "AMZN MKTP"
     PayPal:     "PAYPAL *SATURN 22122243333"          -> "SATURN"
     Card:       "LIDL 5954 HEILBRONN"                 -> "LIDL" */
function suggestPattern(desc) {
  if (!desc) return '';
  // Comdirect: the payee sits between "Auftraggeber:" and the next field.
  const cd = desc.match(/Auftraggeber:\s*(.+?)\s*(?:Buchungstext:|Verwendungszweck:|Buchungsschluessel:|Ref\.|$)/i);
  if (cd) {
    const s = cd[1].replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 40).trim() : s;
  }
  let s = desc.replace(/\s+/g, ' ').trim();
  // PayPal puts the real merchant after the asterisk.
  const pp = s.match(/PAYPAL\s*\*\s*([A-Za-zÄÖÜäöü][\w .&'-]*?)(?:\s+\d{3,}.*)?$/i);
  if (pp) return pp[1].replace(/\s+\d+$/, '').trim();
  // Generic: drop ref-like tokens (pure numbers, 3+ digit runs, code*id, urls)
  // and keep the leading merchant words.
  const tokens = s.split(' ').filter(t =>
    !/^\d+$/.test(t) && !/\d{3,}/.test(t) && !/[*]/.test(t) && !/\.(com|de|net|org)\b/i.test(t)
  );
  let out = tokens.slice(0, 2).join(' ').trim() || tokens.join(' ') || s;
  return out.length > 40 ? out.slice(0, 40).trim() : out;
}

export function TransactionsScreen({ go, currency, household, initialFilter, registerSetReview, myUserId = 1 }) {
  const _adaptTx = (data) => data.map(t => ({ ...t, d: new Date(t.date), desc: t.description, amount_base: t.amount_base ?? t.amount }));
  const _adaptAccounts = (data) => data.map(a => ({ id: a.id, name: a.name, type: a.type, orig_cur: a.currency, cls: typeToClass(a.type), base: 0, orig_bal: 0, is_active: a.is_active }));
  const _cachedTx = loadCache('transactions');
  const [tx, setTx] = useState(() => _cachedTx ? _adaptTx(_cachedTx) : DATA.TX.map(t => ({ ...t })));
  const _cachedAccounts = loadCache('accounts');
  const [accounts, setAccounts] = useState(() => _cachedAccounts ? _adaptAccounts(_cachedAccounts) : DATA.ACCOUNTS);
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
  const [fCat, setFCat] = useState(() => initialFilter?.category || 'all');
  const [fUser, setFUser] = useState('all');
  const [fRange, setFRange] = useState(() => initialFilter?.month ? 'm:' + initialFilter.month : '365');
  const last6Months = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ value: `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) });
    }
    return months;
  }, []);
  const [needsReview, setNeedsReview] = useState(!!(initialFilter && initialFilter.needsReview));
  const [sel, setSel] = useState(() => new Set());
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(null);       // {ids:[], x, y, bulk}
  const [rulePrompt, setRulePrompt] = useState(null); // {desc, catId}
  const [rulePattern, setRulePattern] = useState('');
  const [toast, showToast] = useToast();
  const pageSize = 11;

  // Apply filters passed in via navigation (e.g. drilling in from Cash Flow) so the
  // same category + period the user was viewing is reflected here.
  useEffect(() => {
    if (!initialFilter) return;
    if (initialFilter.needsReview) setNeedsReview(true);
    if (initialFilter.category) setFCat(initialFilter.category);
    if (initialFilter.month) setFRange('m:' + initialFilter.month);
    else if (initialFilter.category) setFRange('365'); // yearly drill -> trailing 12 months
  }, [initialFilter]);
  const reviewCount = tx.filter(t => t.needs_review).length;
  useEffect(() => { registerSetReview && registerSetReview(reviewCount); }, [reviewCount]);

  useEffect(() => {
    getAccounts().then(data => {
      if (data.length > 0) { saveCache('accounts', data); setAccounts(_adaptAccounts(data)); }
    }).catch(() => {});
  }, []);

  // Fetch from the server scoped to the active category + period, rather than relying
  // on a single recent-500 client cache. With >500 rows total, an unscoped fetch drops
  // the oldest months — so drilling into e.g. January (a category+month from Cash Flow)
  // would show nothing. Scoping the query keeps the relevant rows in the set.
  useEffect(() => {
    let stale = false;
    const category = fCat !== 'all' ? fCat : undefined;
    let period;
    if (fRange.startsWith('m:')) period = { month: fRange.slice(2) };
    else if (fRange !== 'all') period = { months: Math.ceil(+fRange / 30) + 1 };
    getTransactions(500, category, period).then(data => {
      if (stale) return;
      if (!category) saveCache('transactions', data);
      setTx(_adaptTx(data));
    }).catch(() => {});
    return () => { stale = true; };
  }, [fCat, fRange]);

  const filtered = useMemo(() => {
    const cut = fRange !== 'all' && !fRange.startsWith('m:')
      ? (() => { const d = new Date(); d.setDate(d.getDate() - +fRange); return d; })()
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
      setRulePattern(suggestPattern(t.desc));
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
        <Dropdown label="Account" searchable display={fAcct === 'all' ? 'All' : (acctMap[fAcct]?.name ?? 'Account')}>
          <DDItem on={fAcct === 'all'} onClick={() => setFAcct('all')}>All accounts</DDItem>
          <div className="dd-sep" />
          {accounts.filter(a => a.is_active).map(a => <DDItem key={a.id} on={fAcct === a.id} onClick={() => setFAcct(a.id)}>{a.name}</DDItem>)}
        </Dropdown>
        <Dropdown label="Category" searchable display={fCat === 'all' ? 'All' : FMT.catName(fCat)}>
          <DDItem on={fCat === 'all'} onClick={() => setFCat('all')}>All categories</DDItem>
          <div className="dd-sep" />
          {DATA.CATEGORIES.map(c => <DDItem key={c.id} on={fCat === c.id} onClick={() => setFCat(c.id)} dot={c.color} search={c.name}>{c.name}</DDItem>)}
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
          (last6Months.find(m => m.value === fRange)?.label ??
            (fRange.startsWith('m:')
              ? (() => { const [y, mo] = fRange.slice(2).split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); })()
              : 'Period'))
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
      {rulePrompt && (() => {
        const pat = rulePattern.trim().toLowerCase();
        const matchCount = pat ? tx.filter(t => t.needs_review && t.desc.toLowerCase().includes(pat)).length : 0;
        const applyRule = () => {
          const clean = rulePattern.trim();
          if (!clean) { setRulePrompt(null); return; }
          createCategoryRule(clean, rulePrompt.catId).catch(() => {});
          const low = clean.toLowerCase();
          const ids = tx.filter(t => t.needs_review && t.desc.toLowerCase().includes(low)).map(t => t.id);
          if (ids.length) applyCat(ids, rulePrompt.catId);
          showToast(
            ids.length
              ? `Rule saved · ${ids.length} more review${ids.length > 1 ? 's' : ''} categorized`
              : 'Rule saved · future matches auto-categorized',
            'bolt'
          );
          setRulePrompt(null);
        };
        return (
        <div className="scrim" onClick={() => setRulePrompt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="row" style={{ gap: 11, marginBottom: 14 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="bolt" s={20} c="var(--accent)" /></span>
              <div><div style={{ fontSize: 16, fontWeight: 800 }}>Create a rule?</div><div className="kpi-sub">Auto-categorize matching transactions</div></div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 12px' }}>
              Categorize any transaction whose description contains this text as{' '}
              <span style={{ color: FMT.catColor(rulePrompt.catId), fontWeight: 700 }}>{FMT.catName(rulePrompt.catId)}</span>:
            </p>
            <input
              className="inp"
              value={rulePattern}
              onChange={e => setRulePattern(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') applyRule(); }}
              style={{ width: '100%', marginBottom: 10, fontWeight: 600 }}
            />
            <p className="kpi-sub" style={{ margin: '0 0 20px' }}>
              {pat
                ? <>Matches <b style={{ color: matchCount ? 'var(--warn)' : 'var(--text-3)' }}>{matchCount}</b> open review{matchCount === 1 ? '' : 's'} right now · also applies to future imports.</>
                : 'Enter a keyword to match (e.g. a merchant name).'}
            </p>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => { showToast('Categorized once'); setRulePrompt(null); }}>No, just this one</button>
              <button className="btn primary" disabled={!rulePattern.trim()} onClick={applyRule}>
                {matchCount > 1 ? `Yes — apply to ${matchCount}` : 'Yes, always'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {toast}
    </div>
  );
}

function CatMenu({ x, y, onPick, onClose, bulk, count }) {
  const ref = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, []);

  const all = useMemo(() => DATA.CATEGORIES.filter(c => c.id !== 'uncategorized'), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.group || '').toLowerCase().includes(q) ||
      (c.kind || '').toLowerCase().includes(q)
    );
  }, [all, query]);
  useEffect(() => { setActive(0); }, [query]);
  // keep the highlighted row in view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="1"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) onPick(filtered[active].id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 420);
  return (
    <div ref={ref} className="dd-menu" style={{ position: 'fixed', left, top, minWidth: 230, width: 230, zIndex: 130 }}>
      {bulk && <div className="kpi-sub" style={{ padding: '4px 10px 6px' }}>Apply to {count} selected</div>}
      <div style={{ padding: '6px 8px 8px', position: 'sticky', top: 0, background: 'var(--surface-2, #1a1f2e)', zIndex: 1 }}>
        <input
          className="inp" autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
          placeholder="Type to filter…" style={{ width: '100%', height: 32, fontSize: 13 }}
        />
      </div>
      <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
        {filtered.map((c, i) => (
          <button key={c.id} data-active={i === active ? '1' : '0'} className="dd-item"
            onMouseEnter={() => setActive(i)} onClick={() => onPick(c.id)}
            style={i === active ? { background: 'var(--accent-soft)' } : undefined}>
            <span className="dot-c" style={{ background: c.color }} /><span style={{ flex: 1 }}>{c.name}</span>
            <span className="fx" style={{ textTransform: 'capitalize' }}>{c.kind}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="fx" style={{ padding: '10px 12px', textAlign: 'center' }}>No category matches “{query}”.</div>
        )}
      </div>
    </div>
  );
}
