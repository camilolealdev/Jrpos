import asyncio, sys
import urllib.parse

import os

REF = "ibozqezzkzxzegjuzpxv"
# Nunca hardcodear credenciales. Pasar por variable de entorno:
#   PGPASSWORD=... python scripts/find_pooler_region.py
PWD = os.environ.get("PGPASSWORD", "")
if not PWD:
    sys.exit("Set PGPASSWORD env var with the DB password before running.")
REGIONS = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-central-1", "eu-central-2",
           "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1", "eu-south-1", "eu-south-2",
           "sa-east-1", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3", "ap-southeast-4",
           "ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "ap-south-1", "ap-south-2",
           "ca-central-1", "me-south-1", "me-central-1", "af-south-1", "il-central-1", "cn-north-1"]
pwd_enc = urllib.parse.quote(PWD, safe="")

async def probe(region, port, label):
    url = f"postgresql://postgres.{REF}:{pwd_enc}@aws-0-{region}.pooler.supabase.com:{port}/postgres"
    try:
        import asyncpg
        conn = await asyncio.wait_for(asyncpg.connect(url, ssl=True, timeout=6), 9)
        await conn.fetchval("SELECT 1")
        await conn.close()
        print(f"WORKING {label} region={region} port={port}", flush=True)
        return True
    except Exception as e:
        msg = str(e)[:90].replace("\n", " ")
        print(f"  {label} {region}:{port} -> {msg}", flush=True)
        return False

async def main():
    r = sys.argv[1] if len(sys.argv) > 1 else None
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 6543
    if r:
        await probe(r, port, "ONE")
        return
    for reg in REGIONS:
        if await probe(reg, 6543, "TX"):
            return
    print("NO_REGION_FOUND")

asyncio.run(main())
