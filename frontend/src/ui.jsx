/* ============================================================
   FIRE Tracker — shared UI primitives (ES module)
   ============================================================ */
/* eslint-disable */
import { useState, useRef, useEffect, useCallback } from 'react';
import { DATA, FMT, FX } from './data.js';

/* ---------------- icons ---------------- */
const ICONS = {
  dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z',
  cashflow: 'M3 17l5-5 4 4 8-9M21 7v5M21 7h-5',
  accounts: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2',
  tx: 'M4 6h16M4 12h16M4 18h10',
  settings: 'M4 5h16M4 12h16M4 19h16',
  search: 'M11 4a7 7 0 105 12 7 7 0 00-5-12zM20 20l-4-4',
  chev: 'M5 8l5 5 5-5',
  chevR: 'M8 5l5 5-5 5',
  arrowR: 'M4 10h12M11 5l5 5-5 5',
  check: 'M4 10l4 4 8-9',
  plus: 'M10 4v12M4 10h12',
  trash: 'M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11',
  edit: 'M4 14l9-9 3 3-9 9H4z',
  upload: 'M10 14V4M6 8l4-4 4 4M4 16h12',
  x: 'M5 5l10 10M15 5L5 15',
  sliders: 'M4 7h9M16 7h4M7 13h13M4 13h0M11 7v0M14 13v0',
  trend: 'M3 15l5-5 4 4 8-9M21 5v5M21 5h-5',
  alert: 'M10 3l8 14H2zM10 8v4M10 15v.5',
  building: 'M4 19V6l6-3 6 3v13M8 9h0M12 9h0M8 13h0M12 13h0',
  coin: 'M10 3a7 4 0 100 8 7 4 0 000-8zM3 7v6a7 4 0 0014 0V7',
  wallet: 'M3 6h14v10H3zM14 10h3v3h-3z',
  filter: 'M3 5h14M6 10h8M9 15h2',
  bolt: 'M11 2L4 12h5l-1 7 7-10h-5z',
  doc: 'M5 3h7l4 4v11H5zM12 3v4h4',
  home: 'M3 10l7-6 7 6M5 9v9h10V9',
};
function Icon({ n, s = 18, sw = 1.7, c = 'currentColor', fill = 'none', style }) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill={fill} stroke={c} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', display: 'block', ...style }}>
      <path d={ICONS[n] || ''} />
    </svg>
  );
}

/* ---------------- money ---------------- */
// shows base USD prominent + original currency muted underneath (or inline)
function Money({ base, cur, amount, inline, signed, size = 'inherit', weight = 800, className = '' }) {
  const showOrig = cur && cur !== 'EUR';
  const baseStr = FMT.eur(base, Number.isInteger(base) ? 0 : 2);
  const sign = signed && base > 0 ? '+' : '';
  const col = signed ? (base >= 0 ? 'var(--pos)' : 'var(--neg)') : 'inherit';
  return (
    <span style={{ display: inline ? 'inline-flex' : 'block', alignItems: 'baseline', gap: inline ? 7 : 0 }}>
      <span className={'num ' + className} style={{ fontSize: size, fontWeight: weight, color: col }}>{sign}{baseStr}</span>
      {showOrig && <span className="fx" style={{ display: inline ? 'inline' : 'block', marginTop: inline ? 0 : 2 }}>{FMT.orig(cur, amount)}</span>}
    </span>
  );
}

/* ---------------- avatar ---------------- */
function Avatar({ user, size = 22 }) {
  const u = DATA.USERS[user];
  return <span className="avatar" title={u.name}
    style={{ width: size, height: size, fontSize: size * .42, background: u.id === 'you' ? 'var(--you)' : 'var(--partner)' }}>
    {u.name[0]}</span>;
}

/* ---------------- switch ---------------- */
function Switch({ on, onChange }) {
  return <div className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></div>;
}

/* ---------------- checkbox ---------------- */
function Check({ on, onChange, indeterminate }) {
  return (
    <div className={'chk' + (on ? ' on' : '')} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      {indeterminate
        ? <svg width="11" height="11" viewBox="0 0 11 11"><rect x="2" y="4.5" width="7" height="2" rx="1" fill="#04121d" /></svg>
        : <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#04121d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>}
    </div>
  );
}

/* ---------------- dropdown ---------------- */
function Dropdown({ label, value, display, children, align = 'left', minWidth }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [open]);
  return (
    <div className="dd" ref={ref}>
      <button className="dd-btn" onClick={() => setOpen(o => !o)}>
        {label && <span className="lab">{label}</span>}
        <span>{display ?? value}</span>
        <Icon n="chev" s={13} c="var(--text-3)" />
      </button>
      {open && (
        <div className={'dd-menu' + (align === 'right' ? ' right' : '')} style={{ minWidth }} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
function DDItem({ on, onClick, dot, children }) {
  return (
    <button className={'dd-item' + (on ? ' on' : '')} onClick={onClick}>
      {dot && <span className="dot-c" style={{ background: dot }} />}
      <span style={{ flex: 1 }}>{children}</span>
      {on && <Icon n="check" s={14} c="var(--accent)" />}
    </button>
  );
}

/* ---------------- top nav ---------------- */
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'cashflow', label: 'Cash Flow', icon: 'cashflow' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts' },
  { id: 'transactions', label: 'Transactions', icon: 'tx' },
  { id: 'settings', label: 'Import & Settings', icon: 'settings' },
];
function TopNav({ screen, go, household, setHousehold, currency, setCurrency, reviewCount }) {
  return (
    <nav className="nav">
      <div className="brand" onClick={() => go('dashboard')}>
        <span className="logo"><svg width="15" height="15" viewBox="0 0 15 15"><path d="M7.5 1.5l5 9h-10l5-9z" fill="#04121d" /><circle cx="7.5" cy="11.5" r="1.6" fill="#04121d" /></svg></span>
        FIRE<small>tracker</small>
      </div>
      <div className="navlinks">
        {NAV_ITEMS.map(it => (
          <button key={it.id} className={'navlink' + (screen === it.id ? ' active' : '')} onClick={() => go(it.id)}>
            <span className="dot" />{it.label}
          </button>
        ))}
      </div>
      <div className="nav-right">
        {reviewCount > 0 && (
          <div className="review-pill" onClick={() => go('transactions', { needsReview: true })}>
            <span className="rdot" />{reviewCount} need review</div>
        )}
        <div className="seg">
          {['you', 'partner', 'household'].map(k => (
            <button key={k} className={household === k ? 'on' : ''} onClick={() => setHousehold(k)}>
              {k !== 'household' && <span className={'av ' + k} />}
              {k === 'you' ? 'You' : k === 'partner' ? 'Partner' : 'Household'}
            </button>
          ))}
        </div>
        <Dropdown align="right" display={<span style={{ fontWeight: 700 }}>{currency} {FX.sym[currency]}</span>}>
          {['EUR', 'USD', 'VND'].map(c => <DDItem key={c} on={currency === c} onClick={() => setCurrency(c)}>{c} · {FX.sym[c]}</DDItem>)}
        </Dropdown>
      </div>
    </nav>
  );
}

/* ---------------- progress bar ---------------- */
function Progress({ pct, h = 14 }) {
  return <div className="bar" style={{ height: h }}><i style={{ width: Math.min(100, pct * 100) + '%' }} /></div>;
}

/* ---------------- ring / gauge ---------------- */
function Ring({ pct, size = 92, stroke = 11, color = 'var(--pos)', track = 'var(--surface-3)', label, sub }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, off = C * (1 - Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1)' }} />
      {label && <text x="50%" y="50%" dy=".05em" textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" fontSize={size * .24} fontWeight="800" fontFamily="Manrope">{label}</text>}
      {sub && <text x="50%" y="50%" dy="1.4em" textAnchor="middle" fill="var(--text-3)" fontSize={size * .11} fontWeight="700" fontFamily="Manrope">{sub}</text>}
    </svg>
  );
}

/* ---------------- donut ---------------- */
function Donut({ segments, size = 180, stroke = 26, gap = 2, center }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const [hov, setHov] = useState(null);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((s, i) => {
          const frac = s.value / total, len = frac * C;
          const seg = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
            strokeWidth={hov === i ? stroke + 4 : stroke} strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`}
            strokeDashoffset={-acc} style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />;
          acc += len; return seg;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        {hov != null ? (
          <>
            <div style={{ width: 9, height: 9, borderRadius: 3, background: segments[hov].color, marginBottom: 6 }} />
            <div className="num" style={{ fontSize: size * .14, fontWeight: 800 }}>{Math.round(segments[hov].value / total * 100)}%</div>
            <div className="kpi-sub" style={{ fontSize: size * .07 }}>{segments[hov].label}</div>
          </>
        ) : center}
      </div>
    </div>
  );
}

/* ---------------- area / line chart ---------------- */
// values: number[]; builds a smooth-ish path. targetY optional (value). markers.
function AreaChart({ values, w = 600, h = 200, color = 'var(--accent)', fill = true, pad = 8, min, max,
  target, targetLabel, dashFromIdx, gridY = 3, id = 'a' }) {
  const lo = min ?? Math.min(...values, target ?? Infinity);
  const hi = max ?? Math.max(...values, target ?? -Infinity);
  const span = (hi - lo) || 1;
  const X = i => pad + i * (w - pad * 2) / (values.length - 1);
  const Y = v => h - pad - (v - lo) / span * (h - pad * 2);
  const pts = values.map((v, i) => [X(i), Y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${X(values.length - 1).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  const gid = 'grad-' + id;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {Array.from({ length: gridY }).map((_, i) => {
        const y = pad + i * (h - pad * 2) / (gridY - 1);
        return <line key={i} x1="0" y1={y} x2={w} y2={y} stroke="var(--border)" strokeWidth="1" />;
      })}
      {target != null && <>
        <line x1="0" y1={Y(target)} x2={w} y2={Y(target)} stroke="var(--accent)" strokeWidth="1.3" strokeDasharray="5 5" opacity=".7" />
        {targetLabel && <text x={w - 4} y={Y(target) - 6} textAnchor="end" fill="var(--accent)" fontSize="11" fontFamily="JetBrains Mono">{targetLabel}</text>}
      </>}
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} />
    </svg>
  );
}

/* sparkline (tiny, no axes) */
function Spark({ values, w = 200, h = 40, color = 'var(--accent)', fill = false }) {
  const lo = Math.min(...values), hi = Math.max(...values), span = (hi - lo) || 1;
  const X = i => i * w / (values.length - 1), Y = v => h - 4 - (v - lo) / span * (h - 8);
  const line = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {fill && <path d={line + ` L${w} ${h} L0 ${h} Z`} fill={color} opacity=".12" />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" />
    </svg>
  );
}

/* ---------------- grouped/waterfall bars (income vs expense) ---------------- */
function CashBars({ data, w = 720, h = 230, mode = 'bars' }) {
  const pad = 28, bw = (w - pad * 2) / data.length;
  const hi = Math.max(...data.map(d => Math.max(d.income, d.expense))) * 1.12;
  const Y = v => h - 24 - v / hi * (h - 44);
  const [hov, setHov] = useState(null);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {[0, .5, 1].map((f, i) => { const y = 20 + f * (h - 44); return <line key={i} x1={pad} y1={y} x2={w - pad} y2={y} stroke="var(--border)" />; })}
        {data.map((d, i) => {
          const cx = pad + i * bw + bw / 2;
          const gw = Math.min(13, bw * .3);
          return (
            <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'pointer' }}>
              <rect x={cx - gw - 2} y={Y(d.income)} width={gw} height={h - 24 - Y(d.income)} rx="3" fill="var(--pos)" opacity={hov == null || hov === i ? 1 : .4} />
              <rect x={cx + 2} y={Y(d.expense)} width={gw} height={h - 24 - Y(d.expense)} rx="3" fill="var(--neg)" opacity={hov == null || hov === i ? 1 : .4} />
              <text x={cx} y={h - 7} textAnchor="middle" fill="var(--text-3)" fontSize="11" fontFamily="JetBrains Mono">{d.label}</text>
              {hov === i && <line x1={cx} y1="20" x2={cx} y2={h - 24} stroke="var(--border-2)" strokeDasharray="3 3" />}
            </g>
          );
        })}
      </svg>
      {hov != null && (
        <div style={{ position: 'absolute', top: 0, left: `${(pad + hov * bw + bw / 2) / w * 100}%`, transform: 'translateX(-50%)', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          <div className="fx" style={{ marginBottom: 4 }}>{data[hov].label} {data[hov].year}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pos)' }}>+{FMT.compactCur('EUR', data[hov].income)} in</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--neg)' }}>−{FMT.compactCur('EUR', data[hov].expense)} out</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Net {FMT.compactCur('EUR', data[hov].net)}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- toast hook ---------------- */
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, icon = 'check') => {
    setToast({ msg, icon }); clearTimeout(window.__tt); window.__tt = setTimeout(() => setToast(null), 2600);
  }, []);
  const node = toast && (
    <div className="toast"><Icon n={toast.icon} s={16} c="var(--accent)" />{toast.msg}</div>
  );
  return [node, show];
}

export {
  Icon, ICONS, Money, Avatar, Switch, Check, Dropdown, DDItem, TopNav, NAV_ITEMS,
  Progress, Ring, Donut, AreaChart, Spark, CashBars, useToast,
};
