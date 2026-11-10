from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, Text, ForeignKey, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from backend.app.core.db import Base

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    icon = Column(String, nullable=False, default="category")
    color = Column(String, nullable=False, default="#1976d2")
    track_expiry = Column(Integer, nullable=False, default=0)
    expiry_label = Column(String, nullable=True, default="Expiry date")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)

    fields = relationship("FieldDef", back_populates="category", cascade="all, delete-orphan", order_by="FieldDef.sort_order")
    items = relationship("Item", back_populates="category")


class FieldDef(Base):
    __tablename__ = "field_defs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    type = Column(String, nullable=False)  # text, longtext, number, date, dropdown, multiselect, checkbox
    required = Column(Integer, nullable=False, default=0)
    options_json = Column(Text, nullable=True)
    unit = Column(String, nullable=True)
    hint = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    show_in_list = Column(Integer, nullable=False, default=0)
    archived = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("category_id", "key", name="uq_cat_field_key"),
        CheckConstraint("type IN ('text', 'longtext', 'number', 'date', 'dropdown', 'multiselect', 'checkbox')", name="chk_field_type"),
    )

    category = relationship("Category", back_populates="fields")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="Room")
    notes = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)

    parent = relationship("Location", remote_side=[id], back_populates="children")
    children = relationship("Location", back_populates="parent", order_by="Location.sort_order")
    items = relationship("Item", back_populates="location")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    name = Column(String, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True)
    taken_out = Column(Integer, nullable=False, default=0)
    taken_by = Column(String, nullable=True)
    taken_at = Column(String, nullable=True)
    expiry_date = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    values_json = Column(Text, nullable=False, default="{}")
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)

    category = relationship("Category", back_populates="items")
    location = relationship("Location", back_populates="items")


class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_type = Column(String, nullable=False)  # item, location
    owner_id = Column(Integer, nullable=False)
    file_name = Column(String, nullable=False)
    thumb_name = Column(String, nullable=False)
    width = Column(Integer, nullable=False, default=0)
    height = Column(Integer, nullable=False, default=0)
    bytes = Column(Integer, nullable=False, default=0)
    is_cover = Column(Integer, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)

    __table_args__ = (
        CheckConstraint("owner_type IN ('item', 'location')", name="chk_photo_owner_type"),
    )


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value_json = Column(Text, nullable=False)
