"""phase 2: products and category_meta

Revision ID: 0002_phase2_products
Revises: 0001_phase1_auth
Create Date: 2026-09-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_phase2_products"
down_revision: Union[str, None] = "0001_phase1_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("barcode", sa.String(100), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("category", sa.String(100), nullable=False, server_default="General"),
        sa.Column("price", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("cost", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("stock", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("unit", sa.String(20), nullable=False, server_default="und"),
        sa.Column("tax_rate", sa.Float, nullable=False, server_default="19.0"),
        sa.Column("supplier_id", sa.String(36), nullable=True),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column("is_service", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_products_name", "products", ["name"])
    op.create_index("ix_products_barcode", "products", ["barcode"])
    op.create_index("ix_products_sku", "products", ["sku"])
    op.create_index("ix_products_category", "products", ["category"])

    op.create_table(
        "category_meta",
        sa.Column("name", sa.String(100), primary_key=True),
        sa.Column("emoji", sa.String(20), nullable=True),
        sa.Column("pinned", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("order", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("category_meta")
    op.drop_index("ix_products_category", table_name="products")
    op.drop_index("ix_products_sku", table_name="products")
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_index("ix_products_name", table_name="products")
    op.drop_table("products")
