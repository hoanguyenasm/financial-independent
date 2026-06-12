/* ============================================================
   FIRE Tracker — app shell (nav state, routing, deep links, tweaks)
   ============================================================ */
const { useState: uS, useEffect: uE } = React;

function ls(key, fallback) { try { const v = localStorage.getItem('fire.' + key); return v == null ? fallback : v; } catch { return fallback; } }
function lset(key, v) { try { localStorage.setItem('fire.' + key, v); } catch {} }

const FONTS = {
  'Manrope': "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
  'Plus Jakarta Sans': "'Plus Jakarta Sans',-apple-system,system-ui,sans-serif",
  'Space Grotesk': "'Space Grotesk',-apple-system,system-ui,sans-serif",
};
const ACCENTS = ['#38BDF8', '#8B7CF8', '#34D6A0', '#FBBF24'];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#38BDF8",
  "density": "comfortable",
  "radius": 20,
  "font": "Manrope"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = uS(() => ls('screen', 'dashboard'));
  const [params, setParams] = uS({});
  const [household, setHousehold] = uS(() => ls('household', 'household'));
  const [currency, setCurrency] = uS(() => ls('currency', 'EUR'));
  const [reviewCount, setReviewCount] = uS(DATA.SUMMARY.needs_review);

  // apply tweaks to CSS variables
  uE(() => {
    const r = document.documentElement.style;
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-2', `color-mix(in srgb, ${t.accent} 84%, #0a2540)`);
    r.setProperty('--accent-soft', `color-mix(in srgb, ${t.accent} 15%, transparent)`);
    r.setProperty('--ring', `color-mix(in srgb, ${t.accent} 35%, transparent)`);
    r.setProperty('--r-lg', t.radius + 'px');
    r.setProperty('--font', FONTS[t.font] || FONTS.Manrope);
    document.body.dataset.density = t.density;
  }, [t.accent, t.density, t.radius, t.font]);

  const go = (s, p = {}) => { setScreen(s); setParams(p); lset('screen', s); document.querySelector('.scroll')?.scrollTo(0, 0); };
  uE(() => lset('household', household), [household]);
  uE(() => lset('currency', currency), [currency]);

  const common = { go, currency, household, setCurrency };
  let body;
  if (screen === 'dashboard') body = <DashboardScreen {...common} />;
  else if (screen === 'cashflow') body = <CashFlowScreen {...common} />;
  else if (screen === 'accounts') body = <AccountsScreen {...common} />;
  else if (screen === 'transactions') body = <TransactionsScreen {...common} initialFilter={params} registerSetReview={setReviewCount} />;
  else if (screen === 'settings') body = <SettingsScreen {...common} initialTab={params.tab} />;

  return (
    <>
      <TopNav screen={screen} go={go} household={household} setHousehold={setHousehold}
        currency={currency} setCurrency={setCurrency} reviewCount={reviewCount} />
      <div className="scroll">{body}</div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={ACCENTS} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={['comfortable', 'dense']} onChange={(v) => setTweak('density', v)} />
        <TweakSlider label="Card radius" value={t.radius} min={8} max={24} unit="px" onChange={(v) => setTweak('radius', v)} />
        <TweakSection label="Type" />
        <TweakSelect label="UI font" value={t.font} options={['Manrope', 'Plus Jakarta Sans', 'Space Grotesk']} onChange={(v) => setTweak('font', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
