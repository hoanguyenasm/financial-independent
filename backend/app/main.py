from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions, assets, fi_goals, settings, category_rules, fx_rates, analytics
from app.routers.import_router import router as import_router
from app.routers.nw_snapshots import router as nw_snapshots_router

app = FastAPI(title="FI Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(assets.router)
app.include_router(fi_goals.router)
app.include_router(settings.router)
app.include_router(category_rules.router)
app.include_router(fx_rates.router)
app.include_router(analytics.router)
app.include_router(import_router)
app.include_router(nw_snapshots_router)


@app.get("/health")
def health():
    return {"status": "ok"}
