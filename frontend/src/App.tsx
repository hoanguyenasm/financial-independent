/* ============================================================
   FIRE Tracker — app shell (nav state, deep links)
   ============================================================ */
import { useState, useEffect, Component } from 'react'
import type { ReactNode } from 'react'
import { DATA } from './data.js'
import { TopNav } from './ui.jsx'
import { DashboardScreen } from './screens/dashboard.jsx'
import { CashFlowScreen } from './screens/cashflow.jsx'
import { AccountsScreen } from './screens/accounts.jsx'
import { TransactionsScreen } from './screens/transactions.jsx'
import { SettingsScreen } from './screens/settings.jsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null }
  static getDerivedStateFromError(e: Error) { return { err: e.message } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, color: 'var(--neg)', fontFamily: 'monospace' }}>
        <b>Something went wrong on this screen.</b>
        <pre style={{ marginTop: 12, fontSize: 12, opacity: .7 }}>{this.state.err}</pre>
        <button style={{ marginTop: 16 }} onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    )
    return this.props.children
  }
}

function ls(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem('fire.' + key)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}
function lset(key: string, v: string) {
  try {
    localStorage.setItem('fire.' + key, v)
  } catch {
    /* ignore */
  }
}

type Params = Record<string, unknown>

export default function App() {
  const [screen, setScreen] = useState(() => ls('screen', 'dashboard'))
  const [params, setParams] = useState<Params>({})
  const [household, setHousehold] = useState(() => ls('household', 'household'))
  const [currency, setCurrency] = useState('EUR')
  const [reviewCount, setReviewCount] = useState<number>(DATA.SUMMARY.needs_review)
  const [myUserId] = useState(() => Number(ls('my_user_id', '1')))

  const go = (s: string, p: Params = {}) => {
    setScreen(s)
    setParams(p)
    lset('screen', s)
    document.querySelector('.scroll')?.scrollTo(0, 0)
  }
  useEffect(() => lset('household', household), [household])

  const common = { go, currency, household, setCurrency }
  let body
  if (screen === 'dashboard') body = <DashboardScreen {...common} />
  else if (screen === 'cashflow') body = <CashFlowScreen {...common} />
  else if (screen === 'accounts') body = <AccountsScreen {...common} />
  else if (screen === 'transactions')
    body = <TransactionsScreen {...common} initialFilter={params} registerSetReview={setReviewCount} myUserId={myUserId} />
  else if (screen === 'settings') body = <SettingsScreen {...common} initialTab={params.tab} />

  return (
    <>
      <TopNav
        screen={screen}
        go={go}
        household={household}
        setHousehold={setHousehold}
        currency={currency}
        setCurrency={setCurrency}
        reviewCount={reviewCount}
      />
      <div className="scroll"><ErrorBoundary key={screen}>{body}</ErrorBoundary></div>
    </>
  )
}
