/* ============================================================
   FIRE Tracker — canonical mock data (Germany / EUR base)
   Couple: Duc Hoa Nguyen (Hoa) & Bao Ngoc Pham (Ngoc)
   Base currency EUR. VND only for Unterhalt transfers to Vietnam.
   ES module — exports { DATA, FX, FMT, FIRE }
   ============================================================ */
/* eslint-disable */
  // ---- FX: multiply an original-currency amount by FX[cur] -> base EUR ----
  const FXRATE = { EUR: 1, USD: 0.92, VND: 1 / 27800 };
  const SYM = { EUR: '€', USD: '$', VND: '₫' };

  // ---- formatters ----
  function eur(n, dec = 0) {
    const neg = n < 0;
    const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return (neg ? '-€' : '€') + v;
  }
  function usd(n, dec = 0) {
    const neg = n < 0;
    return (neg ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function vnd(n) {
    const neg = n < 0, a = Math.abs(n); let s;
    if (a >= 1e9) s = (a / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    else if (a >= 1e6) s = (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (a >= 1e3) s = Math.round(a / 1e3) + 'K';
    else s = String(Math.round(a));
    return (neg ? '-₫' : '₫') + s;
  }
  function orig(cur, n) {
    if (cur === 'VND') return vnd(n);
    if (cur === 'USD') return usd(n, 2);
    return eur(n, 2);
  }
  function toBase(cur, n) { return n * (FXRATE[cur] || 1); }     // -> EUR
  // convert a base-EUR figure into the display currency
  function display(cur, eurVal, dec) {
    const v = eurVal / (FXRATE[cur] || 1);
    if (cur === 'VND') return vnd(v);
    if (cur === 'USD') return usd(v, dec ?? 0);
    return eur(v, dec ?? 0);
  }
  function compactCur(cur, eurVal) {
    const v = eurVal / (FXRATE[cur] || 1), a = Math.abs(v), neg = v < 0;
    if (cur === 'VND') return vnd(v);
    const sym = SYM[cur];
    let s;
    if (a >= 1e6) s = (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    else if (a >= 1e3) s = (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    else s = Math.round(a).toString();
    return (neg ? '-' : '') + sym + s;
  }

  // ---- users ----
  const USERS = {
    you: { id: 'you', name: 'Hoa', full: 'Duc Hoa Nguyen', email: 'hoa@haushalt.de', short: 'You' },
    partner: { id: 'partner', name: 'Ngoc', full: 'Bao Ngoc Pham', email: 'ngoc@haushalt.de', short: 'Partner' },
  };

  // ---- accounts (balances in base EUR) ----
  const ACCOUNTS = [
    { id: 'tr', name: 'Trade Republic', type: 'Brokerage', cls: 'stocks', currency: 'EUR', is_active: true, base: 262000, orig_cur: 'EUR', orig_bal: 262000, inst: 'Trade Republic', owner: 'you' },
    { id: 'property', name: 'Rental Apartment · Stuttgart', type: 'Real estate', cls: 'realestate', currency: 'EUR', is_active: true, base: 236000, orig_cur: 'EUR', orig_bal: 236000, inst: 'Eigentumswohnung', owner: 'household' },
    { id: 'scalable', name: 'Scalable Capital', type: 'Brokerage', cls: 'stocks', currency: 'EUR', is_active: true, base: 144000, orig_cur: 'EUR', orig_bal: 144000, inst: 'Scalable', owner: 'partner' },
    { id: 'comdirect', name: 'Comdirect Giro', type: 'Bank', cls: 'cash', currency: 'EUR', is_active: true, base: 58000, orig_cur: 'EUR', orig_bal: 58000, inst: 'Comdirect', owner: 'you' },
    { id: 'ing', name: 'ING Tagesgeld', type: 'Bank', cls: 'cash', currency: 'EUR', is_active: true, base: 34000, orig_cur: 'EUR', orig_bal: 34000, inst: 'ING', owner: 'household' },
    { id: 'revolut', name: 'Revolut', type: 'Bank', cls: 'cash', currency: 'EUR', is_active: true, base: 8000, orig_cur: 'EUR', orig_bal: 8000, inst: 'Revolut', owner: 'partner' },
    { id: 'amex', name: 'American Express', type: 'Credit card', cls: 'cash', currency: 'EUR', is_active: true, base: 0, orig_cur: 'EUR', orig_bal: 0, inst: 'AmEx', owner: 'you' },
    { id: 'revolut_vnd', name: 'Revolut VND', type: 'FX wallet', cls: 'cash', currency: 'VND', is_active: true, base: 432, orig_cur: 'VND', orig_bal: 12000000, inst: 'Revolut · Unterhalt', owner: 'you' },
    { id: 'dkb', name: 'DKB Giro', type: 'Bank', cls: 'cash', currency: 'EUR', is_active: false, base: 0, orig_cur: 'EUR', orig_bal: 0, inst: 'DKB', owner: 'partner' },
  ];
  const ACCT = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));

  // ---- asset-class allocation (EUR) ----
  const ALLOCATION = [
    { key: 'stocks', label: 'Stocks & ETFs', value: 324000, color: 'var(--c-stocks)' },
    { key: 'realestate', label: 'Real estate', value: 236000, color: 'var(--c-realestate)' },
    { key: 'cash', label: 'Cash & savings', value: 100000, color: 'var(--c-cash)' },
    { key: 'crypto', label: 'Crypto', value: 52000, color: 'var(--c-crypto)' },
    { key: 'gold', label: 'Gold', value: 30000, color: 'var(--c-gold)' },
  ];

  // ---- per-asset holdings (prices in asset currency) ----
  const ASSETS = [
    { id: 'vwce', name: 'VWCE', sub: 'Vanguard FTSE All-World', type: 'stocks', acct: 'tr', qty: 1100, avg: 102, price: 116.4, currency: 'EUR' },
    { id: 'iwda', name: 'IWDA', sub: 'iShares Core MSCI World', type: 'stocks', acct: 'scalable', qty: 600, avg: 78, price: 96, currency: 'EUR' },
    { id: 'sxr8', name: 'SXR8', sub: 'iShares S&P 500', type: 'stocks', acct: 'scalable', qty: 80, avg: 420, price: 560, currency: 'EUR' },
    { id: 'sap', name: 'SAP', sub: 'SAP SE', type: 'stocks', acct: 'tr', qty: 180, avg: 132, price: 205, currency: 'EUR' },
    { id: 'asml', name: 'ASML', sub: 'ASML Holding', type: 'stocks', acct: 'tr', qty: 30, avg: 620, price: 720, currency: 'EUR' },
    { id: 'alv', name: 'ALV', sub: 'Allianz SE', type: 'stocks', acct: 'tr', qty: 110, avg: 230, price: 312, currency: 'EUR' },
    { id: 'btc', name: 'BTC', sub: 'Bitcoin', type: 'crypto', acct: 'tr', qty: 0.42, avg: 41000, price: 85000, currency: 'EUR' },
    { id: 'eth', name: 'ETH', sub: 'Ethereum', type: 'crypto', acct: 'tr', qty: 5, avg: 2400, price: 3150, currency: 'EUR' },
    { id: 'gold', name: '4GLD', sub: 'Xetra-Gold', type: 'gold', acct: 'scalable', qty: 380, avg: 62, price: 78, currency: 'EUR' },
    { id: 'apt', name: 'Rental Apartment', sub: 'Stuttgart-Süd · 3.5 Zi', type: 'realestate', acct: 'property', qty: 1, avg: 185000, price: 236000, currency: 'EUR', ownership: 100, monthly_income: 2100 },
  ];

  // ---- categories (with group + kind) ----
  const CATEGORIES = [
    // income
    { id: 'salary', name: 'Salary', kind: 'income', group: 'Income', color: 'var(--pos)' },
    { id: 'rental', name: 'Rental income', kind: 'income', group: 'Income', color: '#A78BFA' },
    { id: 'airbnb', name: 'Airbnb', kind: 'income', group: 'Income', color: '#C084FC' },
    { id: 'interest', name: 'Interest', kind: 'income', group: 'Income', color: '#2DD4BF' },
    { id: 'dividend', name: 'Dividend', kind: 'income', group: 'Income', color: '#5EEAD4' },
    { id: 'income', name: 'Other income', kind: 'income', group: 'Income', color: '#86EFAC' },
    // investment
    { id: 'etf', name: 'ETF / Sparplan', kind: 'investment', group: 'Investment', color: 'var(--accent)' },
    { id: 'trading', name: 'Trading', kind: 'investment', group: 'Investment', color: '#FBBF24' },
    { id: 'gold', name: 'Gold', kind: 'investment', group: 'Investment', color: '#F59E0B' },
    { id: 'crypto', name: 'Crypto', kind: 'investment', group: 'Investment', color: '#FB923C' },
    { id: 'investment_buy', name: 'Investment buy', kind: 'investment', group: 'Investment', color: '#38BDF8' },
    { id: 'investment_sell', name: 'Investment sell', kind: 'investment', group: 'Investment', color: '#818CF8' },
    { id: 'investment_fees', name: 'Investment fees', kind: 'expense', group: 'Investment', color: '#FB7185' },
    // expense
    { id: 'mortgage', name: 'Mortgage', kind: 'expense', group: 'Housing', color: '#4D9BFF' },
    { id: 'utilities', name: 'Utilities', kind: 'expense', group: 'Housing', color: '#60A5FA' },
    { id: 'groceries', name: 'Groceries', kind: 'expense', group: 'Food', color: '#7CCB4E' },
    { id: 'dining', name: 'Dining', kind: 'expense', group: 'Food', color: '#FB923C' },
    { id: 'insurance', name: 'Insurance', kind: 'expense', group: 'Insurance & Telecom', color: '#F87171' },
    { id: 'telecom', name: 'Telecom', kind: 'expense', group: 'Insurance & Telecom', color: '#F472B6' },
    { id: 'tax', name: 'Tax', kind: 'expense', group: 'Tax', color: '#C084FC' },
    { id: 'health', name: 'Healthcare', kind: 'expense', group: 'Healthcare', color: '#34D399' },
    { id: 'ivf', name: 'IVF', kind: 'expense', group: 'Healthcare', color: '#2DD4BF' },
    { id: 'fitness', name: 'Fitness', kind: 'expense', group: 'Healthcare', color: '#A3E635' },
    { id: 'car', name: 'Car', kind: 'expense', group: 'Transport', color: '#38BDF8' },
    { id: 'transit', name: 'Public transport', kind: 'expense', group: 'Transport', color: '#22D3EE' },
    { id: 'shopping', name: 'Shopping', kind: 'expense', group: 'Lifestyle', color: '#F472B6' },
    { id: 'travel', name: 'Travel', kind: 'expense', group: 'Lifestyle', color: '#5EC8E8' },
    { id: 'subscriptions', name: 'Subscriptions', kind: 'expense', group: 'Lifestyle', color: '#818CF8' },
    { id: 'unterhalt', name: 'Unterhalt', kind: 'expense', group: 'Unterhalt', color: '#E8A33D' },
    { id: 'other', name: 'Other', kind: 'expense', group: 'Other', color: '#8595AD' },
    { id: 'loan', name: 'Loan repayment', kind: 'expense', group: 'Other', color: '#94A3B8' },
    // system (display-only; not normally chosen by hand)
    { id: 'transfer', name: 'Transfer', kind: 'transfer', group: 'Transfer', color: '#94A3B8' },
    { id: 'uncategorized', name: 'Uncategorized', kind: 'expense', group: 'Other', color: 'var(--text-3)' },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  function catName(id) { return id && CAT[id] ? CAT[id].name : null; }
  function catColor(id) { return id && CAT[id] ? CAT[id].color : 'var(--text-3)'; }

  // ---- expense GROUPS (for the expandable Cash Flow view) ----
  // current-month subcategory amounts in EUR (grounded in the April report)
  const GROUP_DEFS = [
    { group: 'Housing', color: '#4D9BFF', subs: [['mortgage', 6943], ['utilities', 668]] },
    { group: 'Lifestyle', color: '#F472B6', subs: [['travel', 1198], ['shopping', 500], ['subscriptions', 64]] },
    { group: 'Unterhalt', color: '#E8A33D', subs: [['unterhalt', 1272]] },
    { group: 'Food', color: '#7CCB4E', subs: [['groceries', 640], ['dining', 380]] },
    { group: 'Transport', color: '#38BDF8', subs: [['car', 220], ['transit', 60]] },
    { group: 'Healthcare', color: '#34D399', subs: [['ivf', 326], ['health', 180], ['fitness', 78]] },
    { group: 'Insurance & Telecom', color: '#F87171', subs: [['insurance', 402], ['telecom', 124]] },
    { group: 'Tax', color: '#C084FC', subs: [['tax', 890]] },
    { group: 'Other', color: '#8595AD', subs: [['other', 480]] },
  ];
  const EXPENSE_GROUPS = GROUP_DEFS.map(g => {
    const subs = g.subs.map(([id, amount]) => ({ id, name: CAT[id].name, amount, color: CAT[id].color, txns: 2 + (amount % 9) }));
    return { group: g.group, color: g.color, subs, total: subs.reduce((s, x) => s + x.amount, 0) };
  }).sort((a, b) => b.total - a.total);
  const EXP_TOTAL = EXPENSE_GROUPS.reduce((s, g) => s + g.total, 0);

  // ---- investment overview (current month money moved in) ----
  const INVEST_SUBS = [
    { id: 'etf', name: 'ETF / Sparplan', amount: 1412, color: 'var(--accent)', note: 'VWCE · IWDA · S&P 500' },
    { id: 'trading', name: 'Trading', amount: 1800, color: '#FBBF24', note: 'SAP, ASML, Allianz' },
    { id: 'gold', name: 'Gold', amount: 300, color: '#F59E0B', note: 'Xetra-Gold Sparplan' },
    { id: 'crypto', name: 'Crypto', amount: 250, color: '#FB923C', note: 'BTC / ETH DCA' },
  ];
  const INVEST_TOTAL = INVEST_SUBS.reduce((s, x) => s + x.amount, 0);

  // ---- income breakdown (current month) ----
  const INCOME_SUBS = [
    { id: 'salary', name: 'Salary (Hoa + Ngoc)', amount: 10307, color: 'var(--pos)' },
    { id: 'rental', name: 'Rental income', amount: 7370, color: '#A78BFA' },
    { id: 'airbnb', name: 'Airbnb', amount: 1488, color: '#C084FC' },
    { id: 'interest', name: 'Interest & dividends', amount: 149, color: '#2DD4BF' },
  ];
  const INCOME_TOTAL = INCOME_SUBS.reduce((s, x) => s + x.amount, 0);

  // ---- seeded RNG ----
  let seed = 20260612;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }

  // transaction templates: [desc, cat, currency, acct, user, [min,max] orig]
  const T = [
    ['Gehalt — Robert Bosch GmbH', 'salary', 'EUR', 'comdirect', 'you', [7293, 7293]],
    ['Gehalt — Mercedes-Benz AG', 'salary', 'EUR', 'ing', 'partner', [3013, 3013]],
    ['Mieteinnahme — Wohnung Stuttgart', 'rental', 'EUR', 'comdirect', 'you', [2100, 2100]],
    ['Airbnb Auszahlung', 'airbnb', 'EUR', 'comdirect', 'you', [380, 1490]],
    ['Erhaltene Zinsen — Trade Republic', 'interest', 'EUR', 'tr', 'you', [28, 149]],
    ['REWE', 'groceries', 'EUR', 'amex', 'you', [24, 96]],
    ['EDEKA', 'groceries', 'EUR', 'amex', 'partner', [18, 88]],
    ['ALDI SÜD', 'groceries', 'EUR', 'comdirect', 'you', [12, 64]],
    ['Lidl', 'groceries', 'EUR', 'comdirect', 'partner', [15, 72]],
    ['dm-drogerie markt', 'health', 'EUR', 'amex', 'partner', [9, 58]],
    ['L\'Osteria', 'dining', 'EUR', 'amex', 'you', [38, 96]],
    ['Vapiano', 'dining', 'EUR', 'revolut', 'partner', [22, 64]],
    ['Starbucks', 'dining', 'EUR', 'amex', 'you', [4.8, 12.5]],
    ['Lieferando', 'dining', 'EUR', 'amex', 'partner', [18, 52]],
    ['Deutsche Bahn — ICE', 'transit', 'EUR', 'comdirect', 'you', [39, 158]],
    ['Aral Tankstelle', 'car', 'EUR', 'amex', 'you', [62, 98]],
    ['Lufthansa — FRA→SGN', 'travel', 'EUR', 'amex', 'partner', [640, 1180]],
    ['Booking.com — Hotel', 'travel', 'EUR', 'revolut', 'you', [120, 410]],
    ['Telekom Festnetz & Internet', 'telecom', 'EUR', 'comdirect', 'you', [49.95, 49.95]],
    ['Vodafone Mobilfunk', 'telecom', 'EUR', 'comdirect', 'partner', [29.99, 29.99]],
    ['Stadtwerke Stuttgart — Strom', 'utilities', 'EUR', 'comdirect', 'you', [118, 168]],
    ['E.ON — Gas', 'utilities', 'EUR', 'comdirect', 'you', [88, 142]],
    ['GEZ Rundfunkbeitrag', 'utilities', 'EUR', 'comdirect', 'you', [55.08, 55.08]],
    ['Allianz Hausratversicherung', 'insurance', 'EUR', 'comdirect', 'you', [402, 402]],
    ['HUK-Coburg KFZ', 'insurance', 'EUR', 'comdirect', 'partner', [86, 86]],
    ['Netflix', 'subscriptions', 'EUR', 'revolut', 'you', [17.99, 17.99]],
    ['Spotify Family', 'subscriptions', 'EUR', 'revolut', 'partner', [17.99, 17.99]],
    ['iCloud+ 2TB', 'subscriptions', 'EUR', 'amex', 'you', [9.99, 9.99]],
    ['ChatGPT Plus', 'subscriptions', 'USD', 'amex', 'you', [20, 20]],
    ['Amazon', 'shopping', 'EUR', 'amex', 'partner', [16, 240]],
    ['Zalando', 'shopping', 'EUR', 'amex', 'partner', [38, 180]],
    ['IKEA', 'shopping', 'EUR', 'comdirect', 'you', [45, 320]],
    ['MediaMarkt', 'shopping', 'EUR', 'amex', 'you', [59, 690]],
    ['Apotheke', 'health', 'EUR', 'amex', 'partner', [12, 64]],
    ['Kinderwunschzentrum — IVF', 'ivf', 'EUR', 'comdirect', 'partner', [180, 520]],
    ['FitX Fitnessstudio', 'fitness', 'EUR', 'comdirect', 'you', [29.99, 29.99]],
    ['Finanzamt Stuttgart — ESt', 'tax', 'EUR', 'comdirect', 'you', [420, 1240]],
    ['Trade Republic — VWCE Sparplan', 'etf', 'EUR', 'tr', 'you', [300, 600]],
    ['Scalable — IWDA Sparplan', 'etf', 'EUR', 'scalable', 'partner', [250, 500]],
    ['Trade Republic — SAP Kauf', 'trading', 'EUR', 'tr', 'you', [400, 1200]],
    ['Xetra-Gold Sparplan', 'gold', 'EUR', 'scalable', 'you', [150, 300]],
    ['Bitcoin DCA', 'crypto', 'EUR', 'tr', 'you', [100, 250]],
    ['Ethereum DCA', 'crypto', 'EUR', 'tr', 'you', [80, 180]],
    ['Teilzahlung Darlehen — Comdirect', 'mortgage', 'EUR', 'comdirect', 'you', [3330, 3330]],
    ['Abgeltungsteuer — Finanzamt', 'tax', 'EUR', 'comdirect', 'you', [220, 890]],
    ['Trade Republic — ASML Kauf', 'trading', 'EUR', 'tr', 'you', [600, 1400]],
    ['Kinderwunsch Stuttgart — IVF Zyklus', 'ivf', 'EUR', 'comdirect', 'partner', [320, 520]],
    ['Stadtwerke Stuttgart — Gas', 'utilities', 'EUR', 'comdirect', 'you', [88, 142]],
    ['Unterhalt — Überweisung Familie VN', 'unterhalt', 'VND', 'revolut_vnd', 'you', [12000000, 16000000]],
    // uncategorized (needs review)
    ['PayPal *DIGISTORE24', null, 'EUR', 'revolut', 'you', [29.9, 29.9]],
    ['Bargeldabhebung — Sparkasse', null, 'EUR', 'comdirect', 'partner', [200, 200]],
    ['SEPA-Lastschrift — VISA 4471', null, 'EUR', 'comdirect', 'you', [84.5, 84.5]],
    ['Überweisung — M. Jaeger', null, 'EUR', 'comdirect', 'you', [500, 500]],
    ['SumUp *DER LADEN', null, 'EUR', 'amex', 'partner', [46.8, 46.8]],
    ['AMZN Mktp DE*RT4', null, 'EUR', 'amex', 'you', [37.2, 37.2]],
    ['Klarna — Ratenzahlung', null, 'EUR', 'revolut', 'partner', [62, 62]],
  ];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(d) { return d.getDate() + '. ' + MONTHS[d.getMonth()]; }
  function isoDay(d) { return d.toISOString().slice(0, 10); }

  const TODAY = new Date(2026, 5, 12); // 12 Jun 2026
  const TX = [];
  let id = 1000;
  // T indices for recurring categories (guaranteed each month)
  // 41=crypto(BTC), 42=crypto(ETH), 43=mortgage, 44=tax, 45=trading(ASML), 46=ivf, 35=fitness, 36=tax-quarterly
  const recurring = [0, 1, 2, 4, 18, 19, 20, 23, 26, 27, 35, 37, 38, 41, 43, 45, 46, 48];
  for (let mAgo = 0; mAgo < 2; mAgo++) {
    recurring.forEach((ti, k) => {
      const day = new Date(TODAY); day.setMonth(day.getMonth() - mAgo); day.setDate(2 + (k % 26));
      if (day > TODAY) return; pushTx(T[ti], day);
    });
  }
  for (let i = 0; i < 44; i++) {
    const t = pick(T.filter((x, idx) => ![0, 1, 2].includes(idx)));
    const day = new Date(TODAY); day.setDate(day.getDate() - Math.floor(rnd() * 64));
    pushTx(t, day);
  }
  function pushTx(t, day) {
    const [desc, cat, cur, acct, user, rng] = t;
    let amt = rng[0] + rnd() * (rng[1] - rng[0]);
    amt = cur === 'VND' ? Math.round(amt / 100000) * 100000 : Math.round(amt * 100) / 100;
    const k = CAT[cat] && CAT[cat].kind;
    const isIncome = k === 'income';
    const signed = isIncome ? amt : -amt;
    TX.push({
      id: 'tx' + (id++), date: isoDay(day), d: day, desc, category: cat,
      currency: cur, amount: signed, amount_base: Math.round(toBase(cur, signed) * 100) / 100,
      account_id: acct, user_id: user, needs_review: cat === null,
    });
  }
  TX.sort((a, b) => b.d - a.d);
  // Patch EXPENSE_GROUPS subcategory txn counts from real TX (so drill-down matches)
  EXPENSE_GROUPS.forEach(g => g.subs.forEach(s => { s.txns = TX.filter(t => t.category === s.id).length || 0; }));
  INVEST_SUBS.forEach(s => { s.txns = TX.filter(t => t.category === s.id).length || 0; });
  const nr = TX.filter(t => t.needs_review);
  nr.slice(7).forEach(t => { t.needs_review = false; t.category = 'shopping'; });

  // ---- 12-month income vs expense ----
  const CASHFLOW = (() => {
    const base = [
      [18200, 12400], [19100, 11800], [17900, 13600], [20400, 12900], [18800, 11500], [22600, 16800],
      [18100, 11900], [19900, 14200], [24910, 18600], [19300, 14150], [18600, 12100], [19314, 14145],
    ];
    return base.map((b, i) => {
      const d = new Date(TODAY); d.setMonth(d.getMonth() - (11 - i));
      return { label: MONTHS[d.getMonth()], year: d.getFullYear(), income: b[0], expense: b[1], net: b[0] - b[1] };
    });
  })();

  // ---- net worth over time (24 months, EUR) ----
  const NW_SERIES = (() => {
    const out = []; let v = 512000;
    for (let i = 23; i >= 0; i--) {
      const d = new Date(TODAY); d.setMonth(d.getMonth() - i);
      v += 9000 + Math.round((rnd() - 0.35) * 12000);
      out.push({ label: MONTHS[d.getMonth()], year: d.getFullYear(), value: i === 0 ? 742000 : Math.round(v) });
    }
    out[out.length - 1].value = 742000;
    return out;
  })();

  // ---- category trend (top groups, 12 months) ----
  const CAT_TREND = [
    { id: 'Housing', name: 'Housing', color: '#4D9BFF' },
    { id: 'Lifestyle', name: 'Lifestyle', color: '#F472B6' },
    { id: 'Food', name: 'Food', color: '#7CCB4E' },
    { id: 'Unterhalt', name: 'Unterhalt', color: '#E8A33D' },
  ].map(c => {
    const baseVal = EXPENSE_GROUPS.find(g => g.group === c.id).total;
    return { ...c, series: CASHFLOW.map(() => Math.round(baseVal * (0.72 + rnd() * 0.55))) };
  });

  // ---- import history ----
  const IMPORTS = [
    { id: 1, file: 'comdirect_2026_05.pdf', acct: 'comdirect', date: '2 Jun 2026', rows: 96, status: 'success', dupes: 6 },
    { id: 2, file: 'amex_statement_may.csv', acct: 'amex', date: '1 Jun 2026', rows: 54, status: 'success', dupes: 3 },
    { id: 3, file: 'traderepublic_q1.csv', acct: 'tr', date: '18 May 2026', rows: 28, status: 'partial', dupes: 0, note: '3 rows skipped — unknown ISIN' },
    { id: 4, file: 'dkb_april.pdf', acct: 'dkb', date: '3 May 2026', rows: 0, status: 'failed', dupes: 0, note: 'Password-protected PDF' },
    { id: 5, file: 'revolut-vnd-export.csv', acct: 'revolut_vnd', date: '28 Apr 2026', rows: 12, status: 'success', dupes: 1 },
  ];

  // ---- auto-categorization rules ----
  const RULES = [
    { id: 1, match: 'REWE SAGT DANKE', cat: 'groceries', hits: 63 },
    { id: 2, match: 'DEUTSCHE BAHN', cat: 'transit', hits: 41 },
    { id: 3, match: 'TELEKOM DEUTSCHLAND', cat: 'telecom', hits: 14 },
    { id: 4, match: 'NETFLIX.COM', cat: 'subscriptions', hits: 12 },
    { id: 5, match: 'STADTWERKE', cat: 'utilities', hits: 18 },
    { id: 6, match: 'AIRBNB PAYMENTS', cat: 'airbnb', hits: 9 },
    { id: 7, match: 'TRADE REPUBLIC SPARPLAN', cat: 'etf', hits: 24 },
  ];

  // ---- FIRE summary + math ----
  const SUMMARY = {
    net_worth: 742000, fi_target: 1500000, base_monthly_savings: 3800, real_return: 0.05,
    passive_income: 2450, monthly_expenses: 5400, savings_rate_month: 42, savings_rate_avg: 38,
    rental_ttm: 1950, needs_review: 7, plan_date: new Date(2037, 0, 1), now: TODAY,
    invested: 324000, re_equity: 236000, cash: 100000,
    swr: 3.5, inflation: 2.0,
  };
  function monthsToFI(monthly, start = SUMMARY.net_worth, target = SUMMARY.fi_target, r = SUMMARY.real_return / 12) {
    let b = start, m = 0; while (b < target && m < 1200) { b = b * (1 + r) + monthly; m++; } return m;
  }
  function fiDate(months) { const d = new Date(SUMMARY.now); d.setMonth(d.getMonth() + months); return d; }
  function fmtMonthYear(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

export const FX = { rate: FXRATE, sym: SYM, base: 'EUR' };
export const FMT = { eur, usd, vnd, orig, toBase, display, displayCompact: compactCur, compactCur, catName, catColor, fmtDay, fmtMonthYear, MONTHS };
export const FIRE = { monthsToFI, fiDate };
export const DATA = {
  USERS, ACCOUNTS, ACCT, ALLOCATION, ASSETS, CATEGORIES, CAT, TX, CASHFLOW,
  EXPENSE_GROUPS, EXP_TOTAL, INVEST_SUBS, INVEST_TOTAL, INCOME_SUBS, INCOME_TOTAL,
  NW_SERIES, CAT_TREND, IMPORTS, RULES, SUMMARY, MONTHS, TODAY,
};
