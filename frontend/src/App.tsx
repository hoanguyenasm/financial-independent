/* ============================================================
   FIRE Tracker — app shell (nav state, deep links)
   ============================================================ */
import { useState, useEffect } from 'react'
import { DATA } from './data.js'
import { TopNav } from './ui.jsx'
import { DashboardScreen } from './screens/dashboard.jsx'
import { CashFlowScreen } from './screens/cashflow.jsx'
import { AccountsScreen } from './screens/accounts.jsx'
import { TransactionsScreen } from './screens/transactions.jsx'
import { SettingsScreen } from './screens/settings.jsx'

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
  const [currency, setCurrency] = useState(() => ls('currency', 'EUR'))
  const [reviewCount, setReviewCount] = useState<number>(DATA.SUMMARY.needs_review)
  const [myUserId] = useState(() => Number(ls('my_user_id', '1')))

  const go = (s: string, p: Params = {}) => {
    setScreen(s)
    setParams(p)
    lset('screen', s)
    document.querySelector('.scroll')?.scrollTo(0, 0)
  }
  useEffect(() => lset('household', household), [household])
  useEffect(() => lset('currency', currency), [currency])

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
      <div className="scroll">{body}</div>
    </>
  )
}
