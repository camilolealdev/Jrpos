import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db import Base
import models_sql  # noqa: F401  (registers every table on Base.metadata)

logger = logging.getLogger("jrpos.migrations")


async def run_auto_migrations(session: AsyncSession) -> None:
    """
    Ejecuta migraciones automáticas e idempotentes para garantizar que todas las
    tablas y columnas multi-tenant SaaS existan en PostgreSQL o SQLite sin romper producción.
    """
    # Crea cualquier tabla que falte (held_sales, promotions, etc.) a partir de
    # los modelos ORM actuales. Es idempotente: create_all() solo crea las
    # tablas que no existen, nunca toca las que ya están (por eso las
    # columnas nuevas en tablas ya existentes siguen necesitando su propio
    # ALTER TABLE más abajo — create_all no altera tablas existentes).
    await session.run_sync(lambda sync_session: Base.metadata.create_all(sync_session.connection()))
    # Commit ya: si no, un rollback más adelante (el batch_script de abajo
    # falla y se revierte a propósito, ver except debajo) deshace también
    # estas tablas recién creadas, porque comparten la misma transacción.
    await session.commit()

    trial_expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    batch_script = f"""
    -- 1. Tablas SaaS de Plataforma
    CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(36) PRIMARY KEY,
        slug VARCHAR(100) NOT NULL UNIQUE,
        business_name VARCHAR(255) NOT NULL,
        nit_rut VARCHAR(50),
        phone VARCHAR(50),
        email VARCHAR(255) NOT NULL,
        business_type VARCHAR(50) DEFAULT 'abarrotes',
        status VARCHAR(20) NOT NULL DEFAULT 'trial',
        trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_plans (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price_cop FLOAT NOT NULL DEFAULT 0.0,
        price_annual_cop FLOAT NOT NULL DEFAULT 0.0,
        max_branches INT NOT NULL DEFAULT 1,
        max_users INT NOT NULL DEFAULT 3,
        max_products INT NOT NULL DEFAULT 5000,
        ai_ocr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        dian_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        plan_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'trial',
        current_period_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
        amount_cop FLOAT NOT NULL DEFAULT 0.0,
        payment_gateway VARCHAR(50) DEFAULT 'manual',
        external_subscription_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS branches (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        city VARCHAR(100),
        phone VARCHAR(50),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tenant_audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36),
        user_name VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(36),
        details TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36),
        user_name VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        user_phone VARCHAR(50),
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'media',
        status VARCHAR(20) NOT NULL DEFAULT 'abierto',
        admin_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Añadir columna tenant_id a tablas operativas
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS modules_config JSON;
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS hidden_module_tids JSON;
    ALTER TABLE platform_plans ADD COLUMN IF NOT EXISTS price_quarterly_cop FLOAT NOT NULL DEFAULT 0.0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
    -- El CHECK constraint de "role" se creó con la tabla original (solo admin/cajero)
    -- y nunca se actualizó al agregar supervisor/contador/superadmin_platform al
    -- modelo ORM; sin este ALTER, insertar cualquiera de esos roles revienta el
    -- arranque del backend con IntegrityError.
    ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
    ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('superadmin_platform', 'admin', 'supervisor', 'cajero', 'contador'));
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_percent FLOAT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_package FLOAT NOT NULL DEFAULT 1.0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE category_meta ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE held_sales ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE held_sale_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE settings_electronic ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE settings_timeclock_schedule ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE settings_certificate ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE timeclock ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE cash_pickups ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE promotions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE document_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE warranties ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE support_docs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE support_doc_items ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE payroll ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);

    -- Asegurar que category_meta tenga clave primaria compuesta (tenant_id, name)
    ALTER TABLE category_meta ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    UPDATE category_meta SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    ALTER TABLE category_meta ALTER COLUMN tenant_id SET NOT NULL;
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'category_meta_pkey'
        ) THEN
            ALTER TABLE category_meta DROP CONSTRAINT category_meta_pkey;
        END IF;
        ALTER TABLE category_meta ADD CONSTRAINT category_meta_pkey PRIMARY KEY (tenant_id, name);
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END $$;

    -- 2b. Row-Level Security: segunda capa de defensa contra fugas cross-tenant
    -- (complementa, no reemplaza, el filtro por tenant_id que ya debe existir
    -- en cada router). backend/auth.py fija app.current_tenant_id/app.is_superadmin
    -- via set_config en cada request autenticado (get_current_user / _provision_tenant).
    -- "users", "tenants", "login_attempts" y "platform_plans" quedan exentas a
    -- proposito: login y el registro de un tenant nuevo necesitan resolver
    -- filas antes de que exista un tenant_id de contexto.
    {"".join(f'''
    UPDATE {t} SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE {t} FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON {t};
    CREATE POLICY tenant_isolation ON {t}
        USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.is_superadmin', true) = 'true')
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.is_superadmin', true) = 'true');
    ''' for t in (
        "tenant_subscriptions", "branches", "tenant_audit_logs", "support_tickets",
        "products", "category_meta", "contacts", "sales", "sale_items", "payments",
        "held_sales", "held_sale_items", "expenses", "purchase_invoices", "purchase_invoice_items",
        "settings_electronic", "settings_timeclock_schedule", "settings_general", "settings_certificate",
        "timeclock", "cash_sessions", "cash_pickups", "promotions", "documents", "document_items",
        "credit_notes", "warranties", "purchase_orders", "purchase_order_items",
        "support_docs", "support_doc_items", "payroll", "commission_rules", "stock_movements",
    ))}

    -- 3. Settings columns existentes
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS store_slogan VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS store_nit VARCHAR(50);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS store_address VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS store_city VARCHAR(100);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS store_department VARCHAR(100);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(100) DEFAULT 'No responsable de IVA';
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10) DEFAULT '$';
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ticket_header_line1 VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ticket_header_line2 VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ticket_show_barcode BOOLEAN DEFAULT TRUE;
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'gemini';
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ai_api_key VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100) DEFAULT 'gemini-1.5-flash';
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS ai_base_url VARCHAR(255);
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS pos_audio_beep BOOLEAN DEFAULT TRUE;
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS pos_ask_clear_cart BOOLEAN DEFAULT TRUE;
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS pos_require_credit_customer BOOLEAN DEFAULT TRUE;
    ALTER TABLE settings_general ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'abarrotes';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS credit_limit FLOAT DEFAULT 0.0;
    ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS denominations TEXT;
    ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS close_notes TEXT;

    -- 4. Siembra de Planes SaaS por Defecto
    INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
    VALUES ('basico', 'Plan Emprendedor', 'Ideal para tiendas de barrio y pequeños comercios', 49000, 490000, 1, 2, 2000, TRUE, FALSE, TRUE, now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
    VALUES ('pro', 'Plan Negocio Pro', 'Para minimercados, droguerías y comercios en crecimiento', 89000, 890000, 3, 10, 20000, TRUE, TRUE, TRUE, now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO platform_plans (id, name, description, price_cop, price_annual_cop, max_branches, max_users, max_products, ai_ocr_enabled, dian_enabled, is_active, created_at)
    VALUES ('franquicia', 'Plan Franquicia Multi-Sede', 'Para cadenas, distribuidoras y múltiples sucursales', 189000, 1890000, 10, 50, 100000, TRUE, TRUE, TRUE, now())
    ON CONFLICT (id) DO NOTHING;

    -- Precio trimestral (~11-12% de descuento vs. 3x mensual); UPDATE idempotente
    -- porque el INSERT ...ON CONFLICT DO NOTHING de arriba no toca filas existentes.
    UPDATE platform_plans SET price_quarterly_cop = 130000 WHERE id = 'basico';
    UPDATE platform_plans SET price_quarterly_cop = 237000 WHERE id = 'pro';
    UPDATE platform_plans SET price_quarterly_cop = 499000 WHERE id = 'franquicia';

    -- 5. Siembra del Tenant por Defecto para retrocompatibilidad
    INSERT INTO tenants (id, slug, business_name, nit_rut, phone, email, business_type, status, trial_ends_at)
    VALUES ('tenant-default-001', 'tienda-principal', 'Tienda Principal', '222222222', '3000000000', 'admin@jrpos.local', 'abarrotes', 'trial', '{trial_expiry}')
    ON CONFLICT (id) DO NOTHING;

    -- 6. Backfill retrocompatible: Asignar tenant-default-001 a todos los registros existentes sin tenant
    UPDATE users SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE products SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE contacts SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE sales SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE sale_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE payments SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE held_sales SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE held_sale_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE expenses SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE purchase_invoices SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE purchase_invoice_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE settings_electronic SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE settings_timeclock_schedule SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE settings_general SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE settings_certificate SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE timeclock SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE cash_sessions SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE cash_pickups SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE promotions SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE documents SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE document_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE credit_notes SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE warranties SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE purchase_orders SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE purchase_order_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE support_docs SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE support_doc_items SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE payroll SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;
    UPDATE commission_rules SET tenant_id = 'tenant-default-001' WHERE tenant_id IS NULL;

    INSERT INTO settings_general (id, tenant_id, store_name, ticket_footer, iva_default, printer_width, accent)
    VALUES (1, 'tenant-default-001', 'JRPOS', '¡Gracias por su compra!', 19, 58, 'emerald')
    ON CONFLICT (id) DO NOTHING;

    -- 7. Secuencias de numeración de documentos (routers usan nextval)
    --    create_all() solo crea tablas; las secuencias deben crearse aparte.
    CREATE SEQUENCE IF NOT EXISTS sales_number_seq;
    CREATE SEQUENCE IF NOT EXISTS documents_number_seq;
    CREATE SEQUENCE IF NOT EXISTS warranties_number_seq;
    CREATE SEQUENCE IF NOT EXISTS credit_notes_number_seq;
    CREATE SEQUENCE IF NOT EXISTS purchase_orders_number_seq;
    CREATE SEQUENCE IF NOT EXISTS payroll_number_seq;
    CREATE SEQUENCE IF NOT EXISTS support_docs_number_seq;

    -- settings_general.id se creó sin IDENTITY/SERIAL (herencia del seed manual
    -- de arriba, "id=1"); backend/auth.py (register y seed_admin) inserta filas
    -- vía ORM sin id explícito para tenants nuevos, lo que revienta con
    -- NotNullViolationError si no hay una secuencia por defecto en la columna.
    CREATE SEQUENCE IF NOT EXISTS settings_general_id_seq OWNED BY settings_general.id;
    ALTER TABLE settings_general ALTER COLUMN id SET DEFAULT nextval('settings_general_id_seq');
    """

    try:
        await session.execute(text(batch_script))
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.debug("Batch migration fallback: %s", e)
        # Fallback declaración por declaración en caso de motores como SQLite
        migrations_sql = [line.strip() for line in batch_script.strip().split(";\n") if line.strip()]
        for stmt in migrations_sql:
            if not stmt:
                continue
            try:
                await session.execute(text(stmt))
                await session.commit()
            except Exception as inner_e:
                await session.rollback()
                err_str = str(inner_e).lower()
                if "syntax error" in err_str or "near \"if\"" in err_str or "near \"not\"" in err_str:
                    try:
                        cleaned_stmt = stmt.replace(" IF NOT EXISTS", "")
                        await session.execute(text(cleaned_stmt))
                        await session.commit()
                    except Exception:
                        await session.rollback()
                logger.debug("Migration fallback step info: %s", inner_e)

    # Resync de settings_general_id_seq como sentencia propia y aislada: metida
    # dentro del batch_script de arriba (un solo session.execute con decenas de
    # sentencias) el SELECT setval(...) no surtía efecto de forma confiable
    # (motivo no confirmado -- posiblemente el driver descarta el resultado de
    # un SELECT intermedio en una ejecucion multi-statement), dejando la
    # secuencia desincronizada y causando UniqueViolationError en cada tenant
    # nuevo registrado via /auth/register-tenant. Como execute() propio y
    # aislado (igual que al probarlo a mano con psql) sí funciona siempre.
    # GREATEST contra el valor actual: nunca debe RETROCEDER la secuencia (eso
    # colisionaria con filas ya insertadas por un arranque anterior), solo
    # adelantarla si hay filas con id mayor al que ya tenia.
    try:
        await session.execute(text(
            """
            SELECT setval(
                'settings_general_id_seq',
                GREATEST(
                    COALESCE((SELECT MAX(id) FROM settings_general), 0) + 1,
                    (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM settings_general_id_seq)
                ),
                false
            )
            """
        ))
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.debug("settings_general_id_seq resync skipped: %s", e)
