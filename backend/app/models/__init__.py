from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Text, ForeignKey, CheckConstraint, UniqueConstraint
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
    expiry_lead_days = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)
    deleted_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

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
    remind = Column(Integer, nullable=False, default=0)
    remind_lead_days = Column(Integer, nullable=True)
    remind_offset_days = Column(Integer, nullable=True)

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
    storage_only = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)
    deleted_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    parent = relationship("Location", remote_side=[id], back_populates="children")
    children = relationship("Location", back_populates="parent", order_by="Location.sort_order")
    items = relationship("Item", back_populates="location")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    name = Column(String, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    taken_out = Column(Integer, nullable=False, default=0)
    taken_out_quantity = Column(Integer, nullable=False, default=0)
    taken_by = Column(String, nullable=True)
    taken_at = Column(String, nullable=True)
    taken_due = Column(String, nullable=True)
    taken_by_profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    taken_by_contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    expiry_date = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    values_json = Column(Text, nullable=False, default="{}")
    status = Column(String, nullable=False, default="active")  # active, inbox, retired
    retired_reason = Column(String, nullable=True)            # sold, donated, thrown_away, broken
    retired_on = Column(String, nullable=True)
    retired_note = Column(Text, nullable=True)
    retired_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    captured_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
    deleted_at = Column(String, nullable=True)
    deleted_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    category = relationship("Category", back_populates="items")
    location = relationship("Location", back_populates="items")
    tags = relationship("Tag", secondary="item_tags", back_populates="items")
    attachments = relationship("Attachment", back_populates="item", cascade="all, delete-orphan")


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


# --- v2 Models ---

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    username = Column(String, unique=True, nullable=True)
    color = Column(String, nullable=False, default="#1976d2")
    avatar_emoji = Column(String, nullable=False, default="Person")
    avatar_photo_filename = Column(String, nullable=True)
    role = Column(String, nullable=False)  # admin, co_admin, member, viewer, custom
    pin_hash = Column(String, nullable=True)
    must_change_password = Column(Integer, nullable=False, default=0)
    custom_permissions_json = Column(Text, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    accent_color = Column(String, nullable=True)
    language = Column(String, nullable=True)
    text_scale = Column(Integer, nullable=False, default=100)
    high_contrast = Column(Integer, nullable=False, default=0)
    theme_mode = Column(String, nullable=False, default="system")
    is_display = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'co_admin', 'member', 'viewer', 'custom')", name="chk_profile_role"),
        CheckConstraint("text_scale IN (100, 125, 150)", name="chk_profile_text_scale"),
        CheckConstraint("theme_mode IN ('system', 'light', 'dark')", name="chk_profile_theme_mode"),
    )


class Activity(Base):
    __tablename__ = "activity"

    id = Column(Integer, primary_key=True, autoincrement=True)
    at = Column(String, nullable=False, default=utc_now_iso)
    actor_id = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    batch_id = Column(String, nullable=True)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    action = Column(String, nullable=False)
    summary = Column(String, nullable=False)
    diff_json = Column(Text, nullable=True)

    actor = relationship("Profile")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, nullable=False, default="#757575")
    created_at = Column(String, nullable=False, default=utc_now_iso)

    items = relationship("Item", secondary="item_tags", back_populates="tags")


class ItemTag(Base):
    __tablename__ = "item_tags"

    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class ReminderState(Base):
    __tablename__ = "reminder_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_type = Column(String, nullable=False)  # expiry, field, loan
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    field_key = Column(String, nullable=True)
    due_date = Column(String, nullable=False)
    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    snoozed_until = Column(String, nullable=True)
    dismissed_at = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint("source_type IN ('expiry', 'field', 'loan')", name="chk_reminder_source_type"),
        UniqueConstraint("source_type", "item_id", "field_key", "due_date", "profile_id", name="uq_reminder_state"),
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    mime = Column(String, nullable=False)
    bytes = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(String, nullable=False, default=utc_now_iso)

    item = relationship("Item", back_populates="attachments")


class Audit(Base):
    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    started_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(String, nullable=False, default=utc_now_iso)
    finished_at = Column(String, nullable=True)
    include_sub = Column(Integer, nullable=False, default=1)
    expected_json = Column(Text, nullable=False, default="[]")
    found_json = Column(Text, nullable=False, default="[]")
    summary_json = Column(Text, nullable=True)


class SavedFilter(Base):
    __tablename__ = "saved_filters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    scope = Column(String, nullable=False, default="items")
    query_json = Column(Text, nullable=False, default="{}")
    created_at = Column(String, nullable=False, default=utc_now_iso)


class HealthIgnore(Base):
    __tablename__ = "health_ignores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    check_key = Column(String, nullable=False)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    other_item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=True)
    ignored_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(String, nullable=False, default=utc_now_iso)

    __table_args__ = (
        UniqueConstraint("check_key", "item_id", "other_item_id", name="uq_health_ignore"),
    )


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)


class LabelTemplate(Base):
    __tablename__ = "label_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False)  # item, location, box
    width_mm = Column(Float, nullable=False)
    height_mm = Column(Float, nullable=False)
    page_json = Column(Text, nullable=True)
    layout = Column(String, nullable=False, default="qr_left")
    fields_json = Column(Text, nullable=False, default="[]")
    style_json = Column(Text, nullable=True)
    is_default = Column(Integer, nullable=False, default=0)
    owner_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    updated_at = Column(String, nullable=False, default=utc_now_iso, onupdate=utc_now_iso)


class Move(Base):
    __tablename__ = "moves"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    target_date = Column(String, nullable=True)
    status = Column(String, nullable=False, default="planning")  # planning, done
    created_by = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(String, nullable=False, default=utc_now_iso)
    finished_at = Column(String, nullable=True)

    boxes = relationship("Box", back_populates="move", cascade="all, delete-orphan")


class Box(Base):
    __tablename__ = "boxes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    move_id = Column(Integer, ForeignKey("moves.id", ondelete="CASCADE"), nullable=False)
    number = Column(Integer, nullable=False)
    label = Column(String, nullable=False)
    destination = Column(String, nullable=True)
    destination_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    colour = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="packing")  # packing, packed, unpacked
    created_at = Column(String, nullable=False, default=utc_now_iso)

    move = relationship("Move", back_populates="boxes")
    box_items = relationship("BoxItem", back_populates="box", cascade="all, delete-orphan")


class BoxItem(Base):
    __tablename__ = "box_items"

    box_id = Column(Integer, ForeignKey("boxes.id", ondelete="CASCADE"), primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    active = Column(Integer, nullable=False, default=1)
    added_at = Column(String, nullable=False, default=utc_now_iso)

    box = relationship("Box", back_populates="box_items")
