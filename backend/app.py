import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from auth import auth_router, seed_admin
from db import SessionLocal
from routers.products import products_router
from routers.contacts import contacts_router
from routers.users import users_router
from routers.sales import sales_router
from routers.held import held_router
from routers.cash import cash_router
from routers.expenses import expenses_router
from routers.reports import reports_router
from routers.settings import settings_router
from routers.promotions import promotions_router
from routers.timeclock import timeclock_router
from routers.credit_notes import credit_notes_router
from routers.warranties import warranties_router
from routers.docs import docs_router
from routers.purchase_orders import purchase_orders_router
from routers.invoices import invoices_router
from routers.payroll import payroll_router
from routers.electronic import electronic_router
from routers.radian import radian_router
from routers.commissions import commissions_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with SessionLocal() as session:
        await seed_admin(session)
    yield


app = FastAPI(title="JRPOS API", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(products_router)
app.include_router(contacts_router)
app.include_router(users_router)
app.include_router(sales_router)
app.include_router(held_router)
app.include_router(cash_router)
app.include_router(expenses_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(promotions_router)
app.include_router(timeclock_router)
app.include_router(credit_notes_router)
app.include_router(warranties_router)
app.include_router(docs_router)
app.include_router(purchase_orders_router)
app.include_router(invoices_router)
app.include_router(payroll_router)
app.include_router(electronic_router)
app.include_router(radian_router)
app.include_router(commissions_router)

_frontend_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_frontend_origins,
    allow_origin_regex=os.environ.get("FRONTEND_URL_REGEX") or r"^https://.*\.vercel\.app$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def root():
    return {"message": "JRPOS API", "status": "ok"}
