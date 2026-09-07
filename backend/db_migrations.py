import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("jrpos.migrations")


async def run_auto_migrations(session: AsyncSession) -> None:
    """
    Ejecuta migraciones automáticas e idempotentes para garantizar que todas las
    columnas y tablas nuevas existan en PostgreSQL (Supabase/Neon) o SQLite sin romper producción.
    """
    batch_script = """
    CREATE TABLE IF NOT EXISTS settings_general (
        id INTEGER PRIMARY KEY DEFAULT 1,
        store_name VARCHAR(255) DEFAULT 'JRPOS',
        ticket_footer TEXT DEFAULT '¡Gracias por su compra!',
        iva_default INTEGER NOT NULL DEFAULT 19,
        printer_width INTEGER NOT NULL DEFAULT 58,
        accent VARCHAR(20) DEFAULT 'emerald',
        support_phone VARCHAR(50)
    );
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
    CREATE TABLE IF NOT EXISTS category_meta (
        name VARCHAR(100) PRIMARY KEY,
        emoji VARCHAR(20),
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        "order" INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO settings_general (id, store_name, ticket_footer, iva_default, printer_width, accent)
    VALUES (1, 'JRPOS', '¡Gracias por su compra!', 19, 58, 'emerald')
    ON CONFLICT (id) DO NOTHING;
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
