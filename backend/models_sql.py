import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'cajero')", name="ck_users_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="cajero")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    identifier: Mapped[str] = mapped_column(String(255), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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


class CategoryMeta(Base):
    __tablename__ = "category_meta"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    emoji: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # customer | supplier
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document: Mapped[str | None] = mapped_column(String(50), nullable=True)
    document_type: Mapped[str | None] = mapped_column(String(10), nullable=True, default="CC")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HeldSaleItem(Base):
    __tablename__ = "held_sale_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    held_sale_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True, default=19.0)


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_nit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PurchaseInvoiceItem(Base):
    __tablename__ = "purchase_invoice_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    nit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolucion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prefijo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rango_desde: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rango_hasta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fecha_resolucion: Mapped[str | None] = mapped_column(String(20), nullable=True)


class SettingsTimeclockSchedule(Base):
    __tablename__ = "settings_timeclock_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    entry_time: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")
    exit_time: Mapped[str] = mapped_column(String(5), nullable=False, default="18:00")
    tolerance_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)


class SettingsGeneral(Base):
    __tablename__ = "settings_general"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    store_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ticket_footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    iva_default: Mapped[int] = mapped_column(Integer, nullable=False, default=19)
    printer_width: Mapped[int] = mapped_column(Integer, nullable=False, default=58)
    accent: Mapped[str | None] = mapped_column(String(20), nullable=True)
    support_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)


class SettingsCertificate(Base):
    __tablename__ = "settings_certificate"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires: Mapped[str | None] = mapped_column(String(20), nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Timeclock(Base):
    __tablename__ = "timeclock"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    type: Mapped[str] = mapped_column(String(5), nullable=False)  # in | out
    late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CashSession(Base):
    __tablename__ = "cash_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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


class CashPickup(Base):
    __tablename__ = "cash_pickups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    cash_session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Promotion(Base):
    __tablename__ = "promotions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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
    purchase_order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)


class SupportDoc(Base):
    __tablename__ = "support_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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
    support_doc_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)


class Payroll(Base):
    __tablename__ = "payroll"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
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
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    percent: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

