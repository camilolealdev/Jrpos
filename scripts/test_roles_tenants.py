"""Testing de roles y aislamiento por tenant contra el stack local Docker."""
import io, json, re, subprocess

env = {}
for line in io.open('.env', encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)=(.*)$', line)
    if m:
        env[m.group(1)] = m.group(2).strip()

BASE = "https://localhost"
PASS, FAIL = [], []

def curl(*args):
    r = subprocess.run(["curl", "-sk", "--max-time", "20", *args], capture_output=True, text=True)
    return r.stdout

def code(*args):
    r = subprocess.run(["curl", "-sk", "-o", "nul", "-w", "%{http_code}", "--max-time", "20", *args],
                       capture_output=True, text=True)
    return r.stdout.strip()

def login(email, pwd, jar):
    body = json.dumps({"email": email, "password": pwd})
    out = curl("-c", jar, "-X", "POST", f"{BASE}/api/auth/login",
               "-H", "Content-Type: application/json", "-d", body)
    try:
        return json.loads(out).get("role")
    except Exception:
        return None

def check(name, got, want):
    ok = (int(got) == want) if isinstance(want, int) else (want in str(got))
    (PASS if ok else FAIL).append(f"{name}: got {got}, want {want}")
    print(("PASS" if ok else "FAIL"), name, "->", str(got)[:80])

# --- roles disponibles ---
admin_email, admin_pwd = env["ADMIN_EMAIL"], env["ADMIN_PASSWORD"]
super_email, super_pwd = env.get("SUPERADMIN_EMAIL"), env.get("SUPERADMIN_PASSWORD")

r_admin = login(admin_email, admin_pwd, "c_admin.txt")
check("login admin", r_admin, "admin")

if super_email:
    r_super = login(super_email, super_pwd, "c_super.txt")
    check("login superadmin", r_super, "superadmin_platform")

# crear cajero
cajero_email = "cajero_test@jrpos.co"
curl("-b", "c_admin.txt", "-X", "POST", f"{BASE}/api/users", "-H", "Content-Type: application/json",
     "-d", json.dumps({"email": cajero_email, "password": "Cajero2026*", "name": "Cajero Test", "role": "cajero"}))
r_caj = login(cajero_email, "Cajero2026*", "c_cajero.txt")
check("login cajero", r_caj, "cajero")

# --- matriz de acceso ---
check("cajero -> POST /users (403)", code("-b", "c_cajero.txt", "-X", "POST", f"{BASE}/api/users",
      "-H", "Content-Type: application/json", "-d", "{}"), 403)
check("cajero -> /settings/general GET (200)", code("-b", "c_cajero.txt", f"{BASE}/api/settings/general"), 200)
check("cajero -> /products (200)", code("-b", "c_cajero.txt", f"{BASE}/api/products"), 200)
check("cajero -> /superadmin/stats (403)", code("-b", "c_cajero.txt", f"{BASE}/api/superadmin/stats"), 403)
check("admin -> /superadmin/stats (403)", code("-b", "c_admin.txt", f"{BASE}/api/superadmin/stats"), 403)
check("anon -> /products (401)", code(f"{BASE}/api/products"), 401)
if super_email:
    check("superadmin -> /superadmin/stats (200)", code("-b", "c_super.txt", f"{BASE}/api/superadmin/stats"), 200)

# --- aislamiento por tenant: registrar tenant B ---
reg_body = json.dumps({
    "business_name": "Tienda B Test", "email": "admin_b@test.co",
    "password": "TenantB2026*", "name": "Admin B",
})
out = curl("-X", "POST", f"{BASE}/api/auth/register-tenant", "-H", "Content-Type: application/json", "-d", reg_body)
print("REGISTER RAW:", out[:220])
try:
    tb_email = json.loads(out).get("user", {}).get("email", "admin_b@test.co")
except Exception:
    tb_email = "admin_b@test.co"
r_b = login(tb_email, "TenantB2026*", "c_tenantb.txt")
check("login tenant-B", r_b, "admin")

prods_b = curl("-b", "c_tenantb.txt", f"{BASE}/api/products")
n_b = len(json.loads(prods_b)) if prods_b.strip().startswith("[") else -1
check("tenant-B ve 0 productos (no fuga de tenant-A)", n_b, 0)
sales_b = curl("-b", "c_tenantb.txt", f"{BASE}/api/sales")
n_sales_b = len(json.loads(sales_b)) if sales_b.strip().startswith("[") else -1
check("tenant-B ve 0 ventas", n_sales_b, 0)

prods_a = curl("-b", "c_admin.txt", f"{BASE}/api/products")
n_a = len(json.loads(prods_a)) if prods_a.strip().startswith("[") else -1
print(f"INFO: tenant-A productos = {n_a}")

# resumen
print(f"\n==== RESULT: {len(PASS)} PASS / {len(FAIL)} FAIL ====")
if FAIL:
    print("FALLAS:")
    for f in FAIL:
        print(" -", f)
