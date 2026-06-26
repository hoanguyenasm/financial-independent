import sqlite3
conn = sqlite3.connect("fi_tracker.db")
rows = conn.execute("""
    SELECT t.id, t.date, t.amount, t.description, t.category, il.filename
    FROM transactions t
    JOIN import_logs il ON t.import_log_id = il.id
    WHERE t.account_id = 1
    ORDER BY t.date DESC
""").fetchall()
for r in rows:
    print(f"{r[1]}  {r[2]:>10.2f}  {r[3][:55]:<55}  {r[4]:<15}  {r[5]}")
total = conn.execute("SELECT COUNT(*) FROM transactions WHERE account_id=1").fetchone()[0]
print(f"\nTotal ING transactions: {total}")
