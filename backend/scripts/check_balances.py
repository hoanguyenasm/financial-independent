import sqlite3
conn = sqlite3.connect("fi_tracker.db")
rows = conn.execute("SELECT id, name, type, balance, balance_as_of FROM accounts ORDER BY id").fetchall()
for r in rows:
    print(f"  {r[0]:2d}: {r[1]:<35s} {str(r[2]):>12s}  {r[4]}")
total = conn.execute("SELECT SUM(balance) FROM accounts WHERE type != 'credit_card' AND balance IS NOT NULL").fetchone()[0]
liab = conn.execute("SELECT SUM(balance) FROM accounts WHERE type = 'credit_card' AND balance IS NOT NULL").fetchone()[0]
assets = conn.execute("SELECT SUM(current_value * ownership_pct / 100.0) FROM assets WHERE current_value IS NOT NULL").fetchone()[0]
print()
print(f"Deposits  : {total:.2f}")
print(f"Liabilities: {liab:.2f}")
print(f"Assets    : {assets:.2f}")
print(f"Net worth : {(total or 0) - (liab or 0) + (assets or 0):.2f}")
