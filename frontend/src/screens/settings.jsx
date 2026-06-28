/* ============================================================
   Screen — Import & Settings  (two tabs)
   ============================================================ */
/* eslint-disable */
import { useState, useEffect, useMemo } from 'react';
import { DATA, FMT, FX } from '../data.js';
import { Icon, Avatar, Dropdown, DDItem, useToast } from '../ui.jsx';
import { getSettings, updateSettings, getCategoryRules, updateCategoryRule, deleteCategoryRule, importFile, importFromPath, importFromTree, getImportLogs, getAccounts, getFIGoal, upsertFIGoal, clearAllTransactions, deleteImportLog, reassignImportLog, clearAllImportLogs, recategorizeAll } from '../lib/api.ts';
import { saveCache, loadCache, clearAllCache } from '../lib/cache.ts';

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
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState(null);   // last import log
  const [error, setError] = useState('');       // persistent error message
  const [history, setHistory] = useState(() => loadCache('import_logs') ?? DATA.IMPORTS);
  const [, showToast] = useToast();
  const [pathInput, setPathInput] = useState('');

  const defaultAccounts = DATA.ACCOUNTS.filter(a => a.is_active);
  const [accounts, setAccounts] = useState(defaultAccounts);
  // 'auto' = detect the bank + owner from the statement and route automatically
  const [selectedAccountId, setSelectedAccountId] = useState('auto');
  const [selectedUserId, setSelectedUserId] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    getAccounts(true).then(data => {
      if (data.length > 0) {
        const adapted = data.map(a => ({
          id: a.id, name: a.name, type: a.type,
          cls: typeToClass(a.type), is_active: a.is_active,
        }));
        setAccounts(adapted);
      }
    }).catch(() => {});
  }, []);

  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState(null);
  const [recat, setRecat] = useState(false);

  const handleRecategorize = async () => {
    setRecat(true);
    try {
      const { updated } = await recategorizeAll();
      clearAllCache(); // categories changed — invalidate cached analytics/transactions
      showToast(updated ? `Re-categorized ${updated} transaction${updated > 1 ? 's' : ''}` : 'No changes — all up to date', 'bolt');
    } catch (err) {
      showToast('Re-categorize failed: ' + (err.message || 'unknown error'), 'x');
    } finally {
      setRecat(false);
    }
  };

  const loadHistory = () => getImportLogs().then(data => { saveCache('import_logs', data); setHistory(data); }).catch(() => {});

  // Accounts grouped by owner for the reassign dropdown: Hoa first, then Norah,
  // then anything else — sorted by name within each group.
  const OWNER_ORDER = ['Hoa', 'Norah'];
  const ownerOf = (name) => OWNER_ORDER.find(o => (name || '').includes(`(${o})`)) || 'Other';
  const groupedAccounts = useMemo(() => {
    const groups = {};
    for (const a of accounts) (groups[ownerOf(a.name)] ??= []).push(a);
    const order = [...OWNER_ORDER, ...Object.keys(groups).filter(o => !OWNER_ORDER.includes(o)).sort()];
    return order
      .filter(o => groups[o]?.length)
      .map(o => ({ owner: o, items: groups[o].sort((x, y) => x.name.localeCompare(y.name)) }));
  }, [accounts]);

  const handleReassign = async (log, newAccountId) => {
    if (!newAccountId || newAccountId === log.account_id) return;
    try {
      const updated = await reassignImportLog(log.id, newAccountId);
      clearAllCache(); // transactions moved accounts — invalidate cached views
      const next = history.map(x => x.id === log.id ? { ...x, account_id: updated.account_id } : x);
      saveCache('import_logs', next);
      setHistory(next);
      const acct = accounts.find(a => a.id === newAccountId);
      showToast(`Moved import to ${acct ? acct.name : 'account ' + newAccountId}`, 'check');
    } catch (err) {
      showToast('Reassign failed: ' + (err.message || 'unknown'), 'x');
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setClearing(true);
    setConfirmClear(false);
    try {
      await clearAllTransactions();
      await clearAllImportLogs();
      clearAllCache();
      setHistory([]);
      showToast('All imported data cleared', 'check');
    } catch (err) {
      showToast('Clear failed: ' + (err.message || 'unknown error'), 'x');
    } finally {
      setClearing(false);
    }
  };
  useEffect(() => { loadHistory(); }, []);

  const afterImport = (log) => {
    localStorage.setItem('fire.my_user_id', String(selectedUserId));
    clearAllCache(); // new data imported — invalidate all cached responses
    setResult(log);
    setError('');
    loadHistory();
    if (log.rows_imported === 0 && log.rows_skipped === 0 && (!log.errors || log.errors.length === 0)) {
      showToast('No rows parsed — format may not be supported yet', 'x');
    } else {
      const filesPart = log.files_processed > 1 ? `${log.files_processed} files · ` : '';
      const acct = accounts.find(a => a.id === log.account_id);
      const acctPart = acct ? `→ ${acct.name} · ` : '';
      showToast(`${acctPart}${filesPart}${log.rows_imported} imported · ${log.rows_skipped} duplicates · ${log.rows_uncategorized} need review`, 'check');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const auto = selectedAccountId === 'auto';
    const targetId = auto ? (accounts[0]?.id ?? 1) : selectedAccountId;
    setUploading(true); setError(''); setResult(null);
    try {
      afterImport(await importFile(file, targetId, selectedUserId, auto));
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePathImport = async () => {
    const path = pathInput.trim();
    if (!path) return;
    const auto = selectedAccountId === 'auto';
    setUploading(true); setError(''); setResult(null);
    try {
      // Auto = detect bank + owner per file and route each to its own account.
      // Manual override = force every file in the path into the chosen account.
      afterImport(auto
        ? await importFromTree(path, selectedUserId)
        : await importFromPath(path, selectedAccountId, selectedUserId));
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', marginBottom: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* dropzone */}
          <div className={'dropzone' + (over ? ' over' : '') + (uploading ? ' disabled' : '')}
            onDragOver={e => { if (!uploading) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); if (!uploading) handleFile(e.dataTransfer.files?.[0]); }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon n="upload" s={26} c="var(--accent)" />
            </span>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
              {uploading ? 'Parsing…' : 'Drop a PDF or CSV statement here'}
            </div>
            <div className="kpi-sub" style={{ marginBottom: 4 }}>
              {uploading ? 'Applying category rules and checking for duplicates'
                : 'or click to browse · Comdirect, ING, Trade Republic, Scalable, Revolut supported'}
            </div>
            {!uploading && <div className="fx">We never store your bank credentials</div>}
            <input type="file" accept=".csv,.pdf" style={{ display: 'none' }}
              id="import-file-input"
              onChange={e => handleFile(e.target.files?.[0])} />
            {!uploading && (
              <button className="btn ghost" style={{ marginTop: 14 }}
                onClick={e => { e.stopPropagation(); document.getElementById('import-file-input').click(); }}>
                Browse files
              </button>
            )}
          </div>

          {/* path import — always visible */}
          <div className="card tight">
            <label className="fld" style={{ marginBottom: 8 }}>Import from path (file or folder)</label>
            <div className="row" style={{ gap: 8 }}>
              <input className="inp mono" style={{ flex: 1, fontSize: 12 }}
                placeholder={"G:\\My Drive\\12_Budget_2026\\ING_Hoa  or  G:\\...\\statement.pdf"}
                value={pathInput}
                onChange={e => { setPathInput(e.target.value); setError(''); setResult(null); }}
                onKeyDown={e => e.key === 'Enter' && !uploading && handlePathImport()}
                disabled={uploading} />
              <button className="btn primary sm" onClick={handlePathImport}
                disabled={!pathInput.trim() || uploading}>
                {uploading ? '…' : 'Import'}
              </button>
            </div>
            {/* persistent error */}
            {error && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--neg)', fontWeight: 600, wordBreak: 'break-word' }}>
                ✗ {error}
              </div>
            )}
            {/* inline result */}
            {result && !error && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: 'var(--pos)' }}>
                  ✓ {result.files_processed > 1 ? `${result.files_processed} files` : (result.filename || '1 file')} · {result.rows_imported} imported · {result.rows_skipped} duplicates · {result.rows_uncategorized} need review
                </span>
                {result.rows_imported === 0 && result.rows_skipped === 0 && (!result.errors || result.errors.length === 0) && (
                  <span style={{ color: 'var(--warn)', display: 'block', marginTop: 2 }}>
                    No rows parsed — file format may not be supported
                  </span>
                )}
                {result.errors && result.errors.length > 0 && (
                  <div style={{ color: 'var(--warn)', marginTop: 4 }}>
                    {result.errors.length} file(s) failed:
                    {result.errors.map((e, i) => <div key={i} style={{ paddingLeft: 8, opacity: 0.85 }}>• {e}</div>)}
                  </div>
                )}
                {/* Per-file routing confirmation (auto-detect path import) */}
                {result.files && result.files.length > 0 && (
                  <div style={{ marginTop: 6, fontWeight: 500 }}>
                    <div className="fx" style={{ marginBottom: 3 }}>Routed to:</div>
                    {result.files.map((f, i) => {
                      const acct = f.account_id ? accounts.find(a => a.id === f.account_id) : null;
                      const routed = f.status !== 'no_account' && acct;
                      return (
                        <div key={i} style={{ paddingLeft: 8, opacity: 0.9, color: routed ? 'var(--text-2)' : 'var(--warn)' }}>
                          • {f.file} → {routed ? acct.name : `not imported — no matching account (bank=${f.bank || '?'}, owner=${f.owner || '?'})`}
                        </div>
                      );
                    })}
                    <div className="fx" style={{ marginTop: 3 }}>Wrong account? Fix it in the import history below.</div>
                  </div>
                )}
              </div>
            )}
            <div className="fx" style={{ marginTop: 6 }}>Path to a PDF/CSV file or a folder — subfolders are crawled automatically</div>
          </div>
        </div>

        <div className="card tight">
          <label className="fld">Target account</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="dd-item"
              onClick={() => { setSelectedAccountId('auto'); setManualOpen(false); }}
              style={{
                border: `1px solid ${selectedAccountId === 'auto' ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedAccountId === 'auto' ? 'var(--accent-soft)' : 'var(--surface-2)',
              }}>
              <Icon n="bolt" s={14} c="var(--accent)" />
              <span style={{ flex: 1 }}>Auto-detect from statement <span className="fx">· recommended</span></span>
              {selectedAccountId === 'auto' && <Icon n="check" s={14} c="var(--accent)" />}
            </button>

            {!manualOpen && selectedAccountId === 'auto' ? (
              <button className="dd-item" onClick={() => setManualOpen(true)}
                style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)' }}>
                <span style={{ flex: 1 }}>Override · choose account manually</span>
                <Icon n="chev" s={13} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="inp" style={{ flex: 1 }}
                  value={selectedAccountId === 'auto' ? '' : selectedAccountId}
                  onChange={e => setSelectedAccountId(Number(e.target.value))}>
                  <option value="" disabled>Select an account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn ghost sm" title="Back to auto-detect"
                  onClick={() => { setSelectedAccountId('auto'); setManualOpen(false); }}>
                  <Icon n="x" s={14} />
                </button>
              </div>
            )}
            {accounts.length === 0 && (
              <div className="fx" style={{ padding: '8px 4px' }}>No accounts found. Create one first.</div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <label className="fld">Imported by</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ id: 1, label: 'You' }, { id: 2, label: 'Partner' }].map(u => (
                <button
                  key={u.id}
                  className={'btn ' + (selectedUserId === u.id ? 'primary' : 'ghost') + ' sm'}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setSelectedUserId(u.id)}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* HISTORY */}
      <section className="card">
        <div className="card-h">
          <div className="t"><b>Import history</b></div>
          {history.length > 0 && (
            <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
              <button
                className="btn sm ghost"
                disabled={recat || clearing}
                onClick={handleRecategorize}
                title="Re-apply all category rules to every existing transaction"
              >
                <Icon n="bolt" s={14} />{recat ? 'Re-categorizing…' : 'Re-categorize all'}
              </button>
              <button
                className={'btn sm ' + (confirmClear ? 'neg' : 'ghost')}
                disabled={clearing}
                onClick={handleClearAll}
                onBlur={() => setConfirmClear(false)}
              >
                {clearing ? 'Clearing…' : confirmClear ? 'Confirm — delete everything?' : 'Clear all data'}
              </button>
            </div>
          )}
        </div>
        <div className="tbl-wrap" style={{ border: 'none', overflow: 'visible' }}>
          <table className="tbl">
            <thead><tr><th>File</th><th>Account</th><th>Date</th><th className="r">Rows</th><th className="c">Status</th><th style={{ width: 32 }}></th></tr></thead>
            <tbody>
              {history.map(h => {
                const confirming = confirmDeleteLogId === h.id;
                return (
                  <tr key={h.id}>
                    <td><div className="row" style={{ gap: 9 }}><Icon n="doc" s={15} c="var(--text-3)" /><span style={{ fontWeight: 600 }}>{h.file || h.filename}</span></div></td>
                    <td className="t2" style={{ fontSize: 12.5 }}>
                      {accounts.length > 0 ? (() => {
                        const a = accounts.find(x => x.id === h.account_id);
                        const display = (
                          <span className="row" style={{ gap: 7 }}>
                            {a && <span style={{ width: 7, height: 7, borderRadius: 2, background: `var(--c-${a.cls})`, flex: '0 0 auto' }} />}
                            <span style={{ fontWeight: 600 }}>{a ? a.name : (h.account_id ? `Account ${h.account_id}` : '—')}</span>
                          </span>
                        );
                        return (
                          <Dropdown searchable display={display} searchPlaceholder="Search account…">
                            {groupedAccounts.flatMap(g => [
                              <div key={'h-' + g.owner} className="dd-sep" style={{ height: 'auto', background: 'transparent', margin: '6px 8px 2px', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-3)' }}>{g.owner}</div>,
                              ...g.items.map(acc => (
                                <DDItem key={acc.id} on={acc.id === h.account_id} dot={`var(--c-${acc.cls})`} search={acc.name}
                                  onClick={() => handleReassign(h, acc.id)}>{acc.name}</DDItem>
                              )),
                            ])}
                          </Dropdown>
                        );
                      })() : (
                        <span style={{ fontWeight: 600 }}>{h.account_id ? `Account ${h.account_id}` : '—'}</span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{h.date || (h.imported_at ? new Date(h.imported_at).toLocaleDateString() : '—')}</td>
                    <td className="r mono" style={{ fontWeight: 700 }}>{h.rows || h.rows_imported || '—'}</td>
                    <td className="c">
                      <span className={'tag sm ' + (h.status === 'success' || h.status === 'done' ? 'pos' : h.status === 'partial' ? 'warn' : 'neg')}>{h.status || 'done'}</span>
                    </td>
                    <td>
                      <button
                        className={'btn icon sm' + (confirming ? ' neg' : '')}
                        title={confirming ? 'Click again to delete this import and its transactions' : 'Delete this import'}
                        style={{ opacity: confirming ? 1 : 0.35, color: confirming ? 'var(--neg)' : undefined, fontSize: confirming ? 10 : undefined, width: confirming ? 'auto' : 28, padding: confirming ? '0 8px' : undefined }}
                        onMouseEnter={e => { if (!confirming) e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={e => { if (!confirming) e.currentTarget.style.opacity = 0.35; }}
                        onBlur={() => setConfirmDeleteLogId(null)}
                        onClick={async () => {
                          if (!confirming) { setConfirmDeleteLogId(h.id); return; }
                          setConfirmDeleteLogId(null);
                          try {
                            await deleteImportLog(h.id);
                            const updated = history.filter(x => x.id !== h.id);
                            saveCache('import_logs', updated);
                            setHistory(updated);
                          } catch (err) {
                            showToast('Delete failed: ' + (err.message || 'unknown'), 'x');
                          }
                        }}
                      >
                        {confirming ? 'Delete?' : <Icon n="x" s={13} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0' }}>No imports yet</td></tr>
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
  // Normalize the mock shape ({match, cat, hits}) to the live shape so both render the same.
  const [rules, setRules] = useState(() => DATA.RULES.map(r => ({ id: r.id, pattern: r.match, category: r.cat, match_count: r.hits })));
  useEffect(() => {
    getCategoryRules()
      .then(data => setRules(data.map(r => ({ id: r.id, pattern: r.pattern, category: r.category, match_count: r.match_count }))))
      .catch(() => {});
  }, []);
  const [hideUnused, setHideUnused] = useState(true);
  const [savingRuleId, setSavingRuleId] = useState(null);

  // Change a rule's category, then reapply all rules to existing data automatically.
  const changeRuleCategory = async (ruleId, newCat) => {
    setSavingRuleId(ruleId);
    setRules(list => list.map(r => r.id === ruleId ? { ...r, category: newCat } : r)); // optimistic
    try {
      await updateCategoryRule(ruleId, { category: newCat });
      const { updated } = await recategorizeAll();
      clearAllCache(); // categories changed — invalidate cached analytics/transactions
      const data = await getCategoryRules();
      setRules(data.map(r => ({ id: r.id, pattern: r.pattern, category: r.category, match_count: r.match_count })));
      showToast(`Rule updated · ${updated} transaction${updated === 1 ? '' : 's'} re-categorized`, 'bolt');
    } catch (err) {
      showToast('Update failed: ' + (err.message || 'unknown error'), 'x');
      getCategoryRules() // revert optimistic change to server truth
        .then(data => setRules(data.map(r => ({ id: r.id, pattern: r.pattern, category: r.category, match_count: r.match_count }))))
        .catch(() => {});
    } finally {
      setSavingRuleId(null);
    }
  };
  // Most-applied first; hide rules that currently match nothing when the toggle is on.
  const shownRules = useMemo(() => {
    const list = hideUnused ? rules.filter(r => (r.match_count ?? 0) > 0) : rules;
    return [...list].sort((a, b) => (b.match_count ?? 0) - (a.match_count ?? 0));
  }, [rules, hideUnused]);
  const unusedCount = useMemo(() => rules.filter(r => (r.match_count ?? 0) === 0).length, [rules]);
  const [goal, setGoal] = useState({ target: 1500000, date: '2037-01', swr: 3.5, ret: 5.0, infl: 2.0 });
  useEffect(() => {
    getFIGoal(1).then(g => {
      setGoal({
        target: g.target_net_worth ?? 1500000,
        date: g.target_date ? g.target_date.slice(0, 7) : '2037-01',
        swr: +(g.safe_withdrawal_rate * 100).toFixed(2),
        ret: +(g.investment_return_rate * 100).toFixed(2),
        infl: +(g.inflation_rate * 100).toFixed(2),
      });
    }).catch(() => {});
  }, []);
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
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
            upsertFIGoal(1, {
              target_net_worth: goal.target,
              target_date: goal.date || undefined,
              safe_withdrawal_rate: goal.swr / 100,
              investment_return_rate: goal.ret / 100,
              inflation_rate: goal.infl / 100,
            })
              .then(() => showToast('FIRE goal saved'))
              .catch(() => showToast('Could not save — backend offline', 'x'));
          }}>Save goal</button></div>
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
        <div className="card-h">
          <div className="t"><b>Auto-categorization rules</b></div>
          <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
            <span className="fx">{shownRules.length} of {rules.length} · sorted by most applied</span>
            {unusedCount > 0 && (
              <button className="btn sm ghost" onClick={() => setHideUnused(v => !v)}>
                {hideUnused ? `Show ${unusedCount} unused` : 'Hide unused'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18 }}>
          {rules.length === 0 && <div className="kpi-sub" style={{ padding: '12px 4px' }}>No rules yet. Categorize a transaction and choose “Create a rule” to add one.</div>}
          {rules.length > 0 && shownRules.length === 0 && <div className="kpi-sub" style={{ padding: '12px 4px' }}>No rules are matching any transactions yet.</div>}
          {shownRules.map((r, i) => {
            const saving = savingRuleId === r.id;
            return (
            <div key={r.id} className="spread" style={{ padding: '9px 4px', borderBottom: i < shownRules.length - 1 ? '1px solid var(--border)' : 'none', opacity: saving ? 0.6 : 1 }}>
              <div className="row" style={{ gap: 9 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>{r.pattern}</span>
                <Icon n="arrowR" s={13} c="var(--text-3)" />
                <span className="dot-c" style={{ background: FMT.catColor(r.category) }} />
                <select
                  className="inp"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 13, fontWeight: 600, color: FMT.catColor(r.category) }}
                  value={r.category}
                  disabled={saving}
                  title="Change the category — the rule is reapplied to all transactions automatically"
                  onChange={e => changeRuleCategory(r.id, e.target.value)}
                >
                  {Object.entries(cats.reduce((acc, c) => { (acc[c.group] ??= []).push(c); return acc; }, {})).map(([group, list]) => (
                    <optgroup key={group} label={group}>
                      {list.map(c => <option key={c.id} value={c.id} style={{ color: 'var(--text)' }}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="fx" title="Transactions currently categorized by this rule">{saving ? 'applying…' : `${r.match_count ?? 0} applied`}</span>
                <button className="btn icon" style={{ padding: 4, background: 'transparent', border: 0 }} disabled={saving} onClick={() => { setRules(list => list.filter(x => x.id !== r.id)); deleteCategoryRule(r.id).catch(() => {}); }}><Icon n="trash" s={15} c="var(--text-3)" /></button>
              </div>
            </div>
            );
          })}
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
