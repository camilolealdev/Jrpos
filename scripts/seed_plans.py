"""Siembra platform_plans (idempotente). Uso: docker compose exec -T backend python - < scripts/seed_plans.py [PROD]"""
import asyncio, ssl, sys, os

SQL = """
INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
VALUES ('basico', 'Plan Emprendedor', 'Ideal para tiendas de barrio y pequenos comercios', 49000, 490000, 1, 2, 2000, TRUE, FALSE, TRUE, now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
VALUES ('pro', 'Plan Negocio Pro', 'Para minimercados, droguerias y comercios en crecimiento', 89000, 890000, 3, 10, 20000, TRUE, TRUE, TRUE, now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
VALUES ('franquicia', 'Plan Franquicia Multi-Sede', 'Para cadenas, distribuidoras y multiples sucursales', 189000, 1890000, 10, 50, 100000, TRUE, TRUE, TRUE, now())
ON CONFLICT (id) DO NOTHING;
"""

async def local():
    import asyncpg
    url = os.environ["DATABASE_URL"]
    conn = await asyncpg.connect(url)
    await conn.execute(SQL)
    n = await conn.fetchval("SELECT count(*) FROM platform_plans")
    await conn.close()
    print("LOCAL plans:", n)

async def prod():
    import asyncpg, urllib.parse
    pwd = urllib.parse.quote("Manilu1729!", safe="")
    url = f"postgresql://postgres.ibozqezzkzxzegjuzpxv:{pwd}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = await asyncpg.connect(url, ssl=ctx)
    await conn.execute(SQL)
    n = await conn.fetchval("SELECT count(*) FROM platform_plans")
    await conn.close()
    print("PROD plans:", n)

if "PROD" in sys.argv:
    asyncio.run(prod())
else:
    asyncio.run(local())
