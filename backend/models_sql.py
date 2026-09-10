import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# =====================================================================
# SAAS PLATFORM & MULTI-TENANT MODELS
# =====================================================================

class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint("status IN ('trial', 'active', 'suspended', 'expired')", name="ck_tenant_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    nit_rut: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    business_type: Mapped[str] = mapped_column(String(50), nullable=False, default="abarrotes")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trial", index=True)
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    modules_config: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=lambda: {
        "ia_ocr": True,
        "whatsapp": True,
        "electronic_invoicing": False,
        "multi_cashier": True,
        "accounting_export": True,
        "warranties": True,
        "promotions": True,
        "payroll": False
    })
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PlatformPlan(Base):
    __tablename__ = "platform_plans"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # basico, pro, franquicia
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_cop: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price_quarterly_cop: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price_annual_cop: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_branches: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    max_products: Mapped[int] = mapped_column(Integer, nullable=False, default=5000)
    ai_ocr_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    dian_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TenantSubscription(Base):
    __tablename__ = "tenant_subscriptions"
    __table_args__ = (
        CheckConstraint("status IN ('trial', 'active', 'past_due', 'canceled')", name="ck_subscription_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    plan_id: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trial")
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount_cop: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payment_gateway: Mapped[str | None] = mapped_column(String(50), nullable=True, default="manual")
    external_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TenantAuditLog(Base):
    __tablename__ = "tenant_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False)
    user_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="media")  # baja, media, alta, urgente
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="abierto", index=True)  # abierto, en_proceso, resuelto, cerrado
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# =====================================================================
# OPERATIONAL ENTITY MODELS (WITH TENANT ISOLATION)
# =====================================================================

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('superadmin_platform', 'admin', 'supervisor', 'cajero', 'contador')", name="ck_users_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="cajero")
    google_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    identifier: Mapped[str] = mapped_column(String(255), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_tenant_barcode", "tenant_id", "barcode"),
        Index("ix_products_tenant_category", "tenant_id", "category"),
        Index("ix_products_tenant_name", "tenant_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General", index=True)
    price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    stock: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="und")
    tax_rate: Mapped[float] = mapped_column(Float, nullable=False, default=19.0)
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    margin_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    units_per_package: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        Index("ix_stock_movements_tenant_product", "tenant_id", "product_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # sale|purchase|adjustment|return|waste
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    previous_stock: Mapped[float] = mapped_column(Float, nullable=False)
    new_stock: Mapped[float] = mapped_column(Float, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CategoryMeta(Base):
    __tablename__ = "category_meta"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    emoji: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        Index("ix_contacts_tenant_kind", "tenant_id", "kind"),
        Index("ix_contacts_tenant_document", "tenant_id", "document"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # customer | supplier
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document: Mapped[str | None] = mapped_column(String(50), nullable=True)
    document_type: Mapped[str | None] = mapped_column(String(10), nullable=True, default="CC")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    credit_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        Index("ix_sales_tenant_created", "tenant_id", "created_at"),
        Index("ix_sales_tenant_customer", "tenant_id", "customer_id"),
        Index("ix_sales_tenant_credit", "tenant_id", "is_credit"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    tax_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="efectivo")
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cashier: Mapped[str | None] = mapped_column(String(255), nullable=True, default="Cajero")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_credit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    balance_due: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    credit_status: Mapped[str] = mapped_column(String(10), nullable=False, default="paid")  # paid|pending|partial
    cufe: Mapped[str | None] = mapped_column(String(100), nullable=True)
    electronic_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    electronic_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = (
        Index("ix_sale_items_tenant_sale", "tenant_id", "sale_id"),
        Index("ix_sale_items_tenant_product", "tenant_id", "product_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    sale_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    tax_rate: Mapped[float] = mapped_column(Float, nullable=False, default=19.0)
    subtotal: Mapped[float | None] = mapped_column(Float, nullable=True)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    sale_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sale_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="efectivo")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HeldSale(Base):
    __tablename__ = "held_sales"
    __table_args__ = (
        Index("ix_held_sales_tenant_created", "tenant_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HeldSaleItem(Base):
    __tablename__ = "held_sale_items"
    __table_args__ = (
        Index("ix_held_items_tenant_held", "tenant_id", "held_sale_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    held_sale_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True, default=19.0)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_tenant_created", "tenant_id", "created_at"),
        Index("ix_expenses_tenant_category", "tenant_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    concept: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="efectivo")
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_nit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PurchaseInvoiceItem(Base):
    __tablename__ = "purchase_invoice_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    purchase_invoice_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    selling_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    units_per_package: Mapped[float | None] = mapped_column(Float, nullable=True)
    margin_percent: Mapped[float | None] = mapped_column(Float, nullable=True)


class SettingsElectronic(Base):
    __tablename__ = "settings_electronic"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    nit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolucion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prefijo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rango_desde: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rango_hasta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fecha_resolucion: Mapped[str | None] = mapped_column(String(20), nullable=True)


class SettingsTimeclockSchedule(Base):
    __tablename__ = "settings_timeclock_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    entry_time: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")
    exit_time: Mapped[str] = mapped_column(String(5), nullable=False, default="18:00")
    tolerance_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)


class SettingsGeneral(Base):
    __tablename__ = "settings_general"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    store_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default="JRPOS")
    store_slogan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_nit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    store_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    store_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tax_regime: Mapped[str | None] = mapped_column(String(100), nullable=True, default="No responsable de IVA")
    currency_symbol: Mapped[str | None] = mapped_column(String(10), nullable=True, default="$")
    
    ticket_footer: Mapped[str | None] = mapped_column(Text, nullable=True, default="¡Gracias por su compra!")
    ticket_header_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ticket_header_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ticket_show_barcode: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    
    iva_default: Mapped[int] = mapped_column(Integer, nullable=False, default=19)
    printer_width: Mapped[int] = mapped_column(Integer, nullable=False, default=58)
    accent: Mapped[str | None] = mapped_column(String(20), nullable=True, default="emerald")
    support_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # AI & OCR Engine Configuration
    ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True, default="gemini")
    ai_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True, default="gemini-1.5-flash")
    ai_base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # POS Ergonomics
    pos_audio_beep: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    pos_ask_clear_cart: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    pos_require_credit_customer: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)

    # Tipo de negocio (gating de módulos de la sidebar)
    business_type: Mapped[str | None] = mapped_column(String(20), nullable=True, default="abarrotes")


class SettingsCertificate(Base):
    __tablename__ = "settings_certificate"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires: Mapped[str | None] = mapped_column(String(20), nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Timeclock(Base):
    __tablename__ = "timeclock"
    __table_args__ = (
        Index("ix_timeclock_tenant_created", "tenant_id", "created_at"),
        Index("ix_timeclock_tenant_user", "tenant_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    type: Mapped[str] = mapped_column(String(5), nullable=False)  # in | out
    late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CashSession(Base):
    __tablename__ = "cash_sessions"
    __table_args__ = (
        Index("ix_cash_sessions_tenant_status", "tenant_id", "status"),
        Index("ix_cash_sessions_tenant_opened", "tenant_id", "opened_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    opened_by: Mapped[str] = mapped_column(String(255), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    base: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="open")  # open | closed
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    counted: Mapped[float | None] = mapped_column(Float, nullable=True)
    expected: Mapped[float | None] = mapped_column(Float, nullable=True)
    diff: Mapped[float | None] = mapped_column(Float, nullable=True)
    sales_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    sales_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pickups_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    denominations: Mapped[str | None] = mapped_column(Text, nullable=True)
    close_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    z_report_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)


class CashPickup(Base):
    __tablename__ = "cash_pickups"
    __table_args__ = (
        Index("ix_cash_pickups_tenant_session", "tenant_id", "cash_session_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    cash_session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Promotion(Base):
    __tablename__ = "promotions"
    __table_args__ = (
        Index("ix_promotions_tenant_active", "tenant_id", "active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False, default="percent_all")
    value: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    start: Mapped[str | None] = mapped_column(String(20), nullable=True)
    end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("kind IN ('quotes', 'remissions', 'collection_accounts')", name="ck_documents_kind"),
        Index("ix_documents_tenant_kind", "tenant_id", "kind"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    concept: Mapped[str | None] = mapped_column(Text, nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sale_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DocumentItem(Base):
    __tablename__ = "document_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    document_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True)


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    sale_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sale_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # credito | debito
    concept: Mapped[str] = mapped_column(String(50), nullable=False, default="devolucion")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    cufe: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="simulada")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Warranty(Base):
    __tablename__ = "warranties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    sale_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sale_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str] = mapped_column(String(30), nullable=False, default="cambio")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="abierta")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="enviada")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    purchase_order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)


class SupportDoc(Base):
    __tablename__ = "support_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_doc: Mapped[str | None] = mapped_column(String(50), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="simulada")
    cude: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SupportDocItem(Base):
    __tablename__ = "support_doc_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    support_doc_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)


class Payroll(Base):
    __tablename__ = "payroll"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    employee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    period: Mapped[str | None] = mapped_column(String(10), nullable=True)
    salary: Mapped[float] = mapped_column(Float, nullable=False)
    bonuses: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    deductions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="simulada")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    percent: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
