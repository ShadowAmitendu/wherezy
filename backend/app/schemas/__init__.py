from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

# --- Common & Errors ---

class ErrorDetail(BaseModel):
    code: str
    message: str
    fields: Optional[Dict[str, str]] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail

class SuccessResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None

class HealthResponse(BaseModel):
    status: str = "ok"
    time: str

# --- Auth ---

class AuthStatusResponse(BaseModel):
    pin_set: bool
    authenticated: bool
    current_profile: Optional[Any] = None

class AuthSetupRequest(BaseModel):
    pin: Optional[str] = None

class AuthLoginRequest(BaseModel):
    pin: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class UserLoginRequest(BaseModel):
    username: str
    password: str

class UpdatePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str

class AuthChangePinRequest(BaseModel):
    current_pin: Optional[str] = None
    new_pin: Optional[str] = None

# --- Settings ---

class PrintDefaults(BaseModel):
    include_sub: bool = True
    show_photos: bool = True
    show_audit_box: bool = True
    font_size: str = "medium"

class SettingsResponse(BaseModel):
    expiry_warn_days: int = 30
    base_url: Optional[str] = None
    label_preset: str = "medium"
    print_defaults: PrintDefaults = Field(default_factory=PrintDefaults)
    theme: str = "system"
    backup_keep: int = 7
    photo_limit_per_owner: int = 10

class SettingsUpdateRequest(BaseModel):
    expiry_warn_days: Optional[int] = None
    base_url: Optional[str] = None
    label_preset: Optional[str] = None
    print_defaults: Optional[PrintDefaults] = None
    theme: Optional[str] = None
    backup_keep: Optional[int] = None
    photo_limit_per_owner: Optional[int] = None

# --- Field Defs & Categories ---

FieldType = Literal["text", "longtext", "number", "date", "dropdown", "multiselect", "checkbox"]

class FieldDefBase(BaseModel):
    label: str
    type: FieldType
    required: bool = False
    options: Optional[List[str]] = None
    unit: Optional[str] = None
    hint: Optional[str] = None
    show_in_list: bool = False

class FieldDefCreate(FieldDefBase):
    key: Optional[str] = None

class FieldDefUpdate(BaseModel):
    label: Optional[str] = None
    type: Optional[FieldType] = None
    required: Optional[bool] = None
    options: Optional[List[str]] = None
    unit: Optional[str] = None
    hint: Optional[str] = None
    show_in_list: Optional[bool] = None
    archived: Optional[bool] = None
    sort_order: Optional[int] = None

class FieldDefOut(BaseModel):
    id: int
    category_id: int
    key: str
    label: str
    type: FieldType
    required: bool
    options: Optional[List[str]] = None
    unit: Optional[str] = None
    hint: Optional[str] = None
    sort_order: int
    show_in_list: bool
    archived: bool

class FieldReorderRequest(BaseModel):
    field_ids: List[int]

class CategoryBase(BaseModel):
    name: str
    icon: str = "category"
    color: str = "#1976d2"
    track_expiry: bool = False
    expiry_label: Optional[str] = "Expiry date"

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    track_expiry: Optional[bool] = None
    expiry_label: Optional[str] = None
    sort_order: Optional[int] = None

class CategoryOut(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    track_expiry: bool
    expiry_label: Optional[str]
    sort_order: int
    items_count: Optional[int] = 0
    created_at: str
    updated_at: str

class CategoryDetailOut(CategoryOut):
    fields: List[FieldDefOut] = []

class TemplateSummary(BaseModel):
    name: str
    slug: str
    icon: str
    color: str
    track_expiry: bool
    expiry_label: Optional[str]
    field_count: int

# --- Photos ---

PhotoOwnerType = Literal["item", "location"]

class PhotoOut(BaseModel):
    id: int
    owner_type: PhotoOwnerType
    owner_id: int
    file_name: str
    thumb_name: str
    width: int
    height: int
    bytes: int
    is_cover: bool
    sort_order: int
    created_at: str
    url: str
    thumb_url: str

class PhotoReorderRequest(BaseModel):
    photo_ids: List[int]

# --- Locations ---

class LocationBreadcrumb(BaseModel):
    id: int
    name: str
    kind: str

class LocationBase(BaseModel):
    name: str
    kind: str = "Room"
    notes: Optional[str] = None
    parent_id: Optional[int] = None

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None

class LocationMoveRequest(BaseModel):
    parent_id: Optional[int] = None

class LocationOut(BaseModel):
    id: int
    name: str
    kind: str
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int
    created_at: str
    updated_at: str
    items_count: Optional[int] = 0
    path: Optional[str] = None

class LocationTreeOut(LocationOut):
    children: List["LocationTreeOut"] = []

class LocationDetailOut(LocationOut):
    breadcrumbs: List[LocationBreadcrumb] = []
    photos: List[PhotoOut] = []
    items_count: int = 0
    children: List[LocationOut] = []

# --- Items ---

ExpiryStatus = Literal["expired", "soon", "ok", "none"]

class ItemBase(BaseModel):
    name: str
    category_id: int
    location_id: Optional[int] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None
    values: Dict[str, Any] = Field(default_factory=dict)

class ItemCreate(ItemBase):
    pass

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    location_id: Optional[int] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None
    values: Optional[Dict[str, Any]] = None

class ItemMoveRequest(BaseModel):
    location_id: Optional[int] = None

class ItemTakenRequest(BaseModel):
    taken_out: bool
    taken_by: Optional[str] = None
    taken_due: Optional[str] = None
    taken_by_profile_id: Optional[int] = None
    taken_by_contact_id: Optional[int] = None

class BulkMoveRequest(BaseModel):
    item_ids: List[int]
    location_id: Optional[int] = None

class BulkMoveResponse(BaseModel):
    ok: bool = True
    moved_count: int

class ItemTagSimple(BaseModel):
    id: int
    name: str
    color: str

class ItemOut(BaseModel):
    id: int
    name: str
    category_id: int
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    category_color: Optional[str] = None
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    location_path: Optional[str] = None
    taken_out: bool = False
    taken_by: Optional[str] = None
    taken_at: Optional[str] = None
    taken_due: Optional[str] = None
    taken_by_profile_id: Optional[int] = None
    taken_by_contact_id: Optional[int] = None
    expiry_date: Optional[str] = None
    expiry_status: Optional[ExpiryStatus] = None
    notes: Optional[str] = None
    values: Dict[str, Any] = Field(default_factory=dict)
    tags: List[ItemTagSimple] = Field(default_factory=list)
    status: str = "active"
    retired_reason: Optional[str] = None
    retired_on: Optional[str] = None
    retired_note: Optional[str] = None
    cover_photo_id: Optional[int] = None
    cover_thumb_url: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

class ItemDetailOut(ItemOut):
    breadcrumbs: List[LocationBreadcrumb] = []
    photos: List[PhotoOut] = []
    field_defs: List[FieldDefOut] = []

class ItemsListResponse(BaseModel):
    items: List[ItemOut]
    total: int
    page: int
    page_size: int
    total_pages: int

# --- Codes ---

CodeType = Literal["item", "location"]

class CodeResolveResponse(BaseModel):
    type: CodeType
    id: int
    item: Optional[ItemOut] = None
    location: Optional[LocationOut] = None

# --- Dashboard ---

class CategoryCount(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    count: int

class DashboardResponse(BaseModel):
    total_items: int
    category_counts: List[CategoryCount]
    taken_out_count: int
    expired_count: int
    expiring_soon_count: int
    expiring_items: List[ItemOut]
    recent_items: List[ItemOut]

# --- Admin ---

class BackupFileOut(BaseModel):
    file_name: str
    size_bytes: int
    created_at: str

class StorageStatsResponse(BaseModel):
    db_bytes: int
    photos_bytes: int
    backups_bytes: int
    total_bytes: int

class ImportCsvResult(BaseModel):
    ok: bool
    dry_run: bool
    total_rows: int
    imported_count: int
    errors: List[str] = []


# ==========================================
# --- v2 Schemas ---
# ==========================================

# --- Profiles & Roles ---

ProfileRole = Literal["admin", "co_admin", "member", "viewer", "custom"]
ThemeMode = Literal["system", "light", "dark"]
TextScale = Literal[100, 125, 150]

class ProfileCreate(BaseModel):
    name: str
    username: Optional[str] = None
    color: str = "#1976d2"
    avatar_emoji: str = "👤"
    role: ProfileRole = "member"
    pin: Optional[str] = None
    password: Optional[str] = None
    custom_permissions: Optional[List[str]] = None
    is_display: bool = False

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    color: Optional[str] = None
    avatar_emoji: Optional[str] = None
    role: Optional[ProfileRole] = None
    pin: Optional[str] = None
    password: Optional[str] = None
    must_change_password: Optional[bool] = None
    custom_permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None

class ProfilePrefsUpdate(BaseModel):
    name: Optional[str] = None
    avatar_emoji: Optional[str] = None
    color: Optional[str] = None
    accent_color: Optional[str] = None
    language: Optional[str] = None
    text_scale: Optional[TextScale] = None
    high_contrast: Optional[bool] = None
    theme_mode: Optional[ThemeMode] = None

class ProfileOut(BaseModel):
    id: int
    name: str
    username: Optional[str] = None
    color: str
    avatar_emoji: str
    role: ProfileRole
    is_active: bool
    must_change_password: bool = False
    custom_permissions: Optional[List[str]] = None
    accent_color: Optional[str] = None
    language: Optional[str] = None
    text_scale: int = 100
    high_contrast: bool = False
    theme_mode: str = "system"
    is_display: bool = False
    has_pin: bool = False
    created_at: str
    updated_at: str

class ProfileSelectRequest(BaseModel):
    profile_id: int
    pin: Optional[str] = None

# --- Activity History ---

class ActivityOut(BaseModel):
    id: int
    at: str
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    batch_id: Optional[str] = None
    entity_type: str
    entity_id: Optional[int] = None
    action: str
    summary: str
    diff_json: Optional[str] = None

class ActivityListResponse(BaseModel):
    items: List[ActivityOut]
    total: int
    next_cursor: Optional[int] = None

class ActivityRevertResponse(BaseModel):
    ok: bool = True
    reverted_id: int
    new_activity_id: int

# --- Tags ---

class TagCreate(BaseModel):
    name: str
    color: str = "#757575"

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class TagMergeRequest(BaseModel):
    target_tag_id: int

class TagOut(BaseModel):
    id: int
    name: str
    color: str
    created_at: str
    items_count: int = 0

class ItemTagsReplaceRequest(BaseModel):
    tag_ids: List[int]

# --- Bulk Operations ---

BulkActionType = Literal[
    "move", "add_tags", "remove_tags", "set_taken", "set_expiry",
    "change_category", "retire", "add_to_box", "delete"
]

class BulkFilter(BaseModel):
    q: Optional[str] = None
    category_id: Optional[int] = None
    location_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    tag_mode: Literal["any", "all"] = "any"
    taken_out: Optional[bool] = None
    expiry_status: Optional[str] = None

class BulkRequest(BaseModel):
    ids: Optional[List[int]] = None
    filter: Optional[BulkFilter] = None
    action: BulkActionType
    params: Dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = False

class BulkSkipItem(BaseModel):
    id: int
    name: str
    reason: str

class BulkResponse(BaseModel):
    ok: bool = True
    dry_run: bool = False
    changed: int = 0
    skipped: List[BulkSkipItem] = []
    batch_id: Optional[str] = None

class BatchUndoResponse(BaseModel):
    ok: bool = True
    batch_id: str
    reverted_count: int

# --- Reminders & Loans ---

ReminderSource = Literal["expiry", "field", "loan"]
ReminderStatus = Literal["overdue", "due_soon", "later", "snoozed", "dismissed"]

class ReminderOut(BaseModel):
    id: str  # synthetic id e.g. "expiry-123" or "field-123-warranty"
    source_type: ReminderSource
    item_id: int
    item_name: str
    category_name: Optional[str] = None
    field_key: Optional[str] = None
    field_label: Optional[str] = None
    due_date: str
    status: ReminderStatus
    lead_days: int
    profile_id: Optional[int] = None
    snoozed_until: Optional[str] = None
    dismissed_at: Optional[str] = None
    borrower_name: Optional[str] = None
    borrower_phone: Optional[str] = None

class ReminderSnoozeRequest(BaseModel):
    source_type: ReminderSource
    item_id: int
    field_key: Optional[str] = None
    due_date: str
    snooze_days: Optional[int] = None
    snoozed_until: Optional[str] = None

class ReminderDismissRequest(BaseModel):
    source_type: ReminderSource
    item_id: int
    field_key: Optional[str] = None
    due_date: str

class ReminderCountResponse(BaseModel):
    overdue: int
    due_soon: int
    total: int

class WebhookTestResponse(BaseModel):
    ok: bool
    status_code: Optional[int] = None
    message: str

# --- Attachments ---

class AttachmentOut(BaseModel):
    id: int
    item_id: int
    file_name: str
    mime: str
    bytes: int
    uploaded_by: Optional[int] = None
    created_at: str

class AttachmentRenameRequest(BaseModel):
    file_name: str

# --- Shelf Audit ---

class AuditStartRequest(BaseModel):
    location_id: int
    include_sub: bool = True

class AuditFoundRequest(BaseModel):
    found_item_ids: List[int]

class AuditItemSummary(BaseModel):
    id: int
    name: str
    location_name: Optional[str] = None
    status: Literal["found", "missing", "misplaced", "in_box"]

class AuditSummary(BaseModel):
    found_count: int
    missing_count: int
    misplaced_count: int
    in_box_count: int
    missing_items: List[AuditItemSummary] = []
    misplaced_items: List[AuditItemSummary] = []

class AuditOut(BaseModel):
    id: int
    location_id: int
    started_by: Optional[int] = None
    started_at: str
    finished_at: Optional[str] = None
    include_sub: bool
    expected_count: int
    found_count: int
    summary: Optional[AuditSummary] = None

# --- Trash ---

class TrashItemOut(BaseModel):
    type: Literal["item", "location", "category"]
    id: int
    name: str
    deleted_at: str
    deleted_by: Optional[int] = None
    deleted_by_name: Optional[str] = None
    original_location_name: Optional[str] = None

class TrashRestoreRequest(BaseModel):
    new_location_id: Optional[int] = None

# --- Quick Search ---

class QuickSearchResult(BaseModel):
    type: Literal["item", "location", "category", "tag", "contact", "action"]
    id: Optional[int] = None
    title: str
    subtitle: Optional[str] = None
    url: str

class QuickSearchResponse(BaseModel):
    results: List[QuickSearchResult]

# --- Saved Filters ---

class SavedFilterCreate(BaseModel):
    name: str
    scope: Literal["items"] = "items"
    query_json: str

class SavedFilterOut(BaseModel):
    id: int
    profile_id: Optional[int] = None
    name: str
    scope: str
    query_json: str
    created_at: str

# --- Inbox & Quick Capture ---

class InboxItemOut(BaseModel):
    id: int
    name: str
    captured_at: Optional[str] = None
    photos: List[PhotoOut] = []
    location_id: Optional[int] = None
    location_name: Optional[str] = None

class InboxSortRequest(BaseModel):
    name: str
    category_id: int
    location_id: Optional[int] = None
    values: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    expiry_date: Optional[str] = None
    tag_ids: Optional[List[int]] = None

class InboxBulkRequest(BaseModel):
    ids: List[int]
    action: Literal["set_location", "set_category", "add_tags", "discard"]
    params: Dict[str, Any] = Field(default_factory=dict)

# --- Retire Lifecycle ---

RetireReason = Literal["sold", "donated", "thrown_away", "broken"]

class ItemRetireRequest(BaseModel):
    reason: RetireReason
    date: str  # YYYY-MM-DD
    note: Optional[str] = None

class ItemUnretireRequest(BaseModel):
    location_id: Optional[int] = None

# --- Data Health ---

class HealthCheckCounts(BaseModel):
    no_location: int
    no_photo: int
    long_expired: int
    duplicates: int
    stale_inbox: int

class HealthItemOut(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    location_path: Optional[str] = None
    reason: str
    other_item_id: Optional[int] = None
    photo_url: Optional[str] = None

class HealthIgnoreRequest(BaseModel):
    check_key: Literal["no_location", "no_photo", "long_expired", "duplicate", "stale_inbox"]
    item_id: int
    other_item_id: Optional[int] = None

# --- Contacts & Loans ---

BorrowerKind = Literal["profile", "contact", "guest"]

class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    note: Optional[str] = None

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None

class ContactOut(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None  # Stripped for Viewers
    note: Optional[str] = None
    is_active: bool = True
    items_out_count: int = 0
    overdue_count: int = 0
    created_at: str
    updated_at: str

class ContactLoanItem(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    location_path: Optional[str] = None
    taken_at: Optional[str] = None
    taken_due: Optional[str] = None
    is_overdue: bool = False

class ContactLoansOut(BaseModel):
    contact: ContactOut
    active_loans: List[ContactLoanItem]
    returned_loans: List[Dict[str, Any]] = []

# --- Moving-House Mode ---

MoveStatus = Literal["planning", "done"]
BoxStatus = Literal["packing", "packed", "unpacked"]

class MoveCreate(BaseModel):
    name: str
    target_date: Optional[str] = None

class MoveUpdate(BaseModel):
    name: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[MoveStatus] = None

class MoveOut(BaseModel):
    id: int
    name: str
    target_date: Optional[str] = None
    status: MoveStatus
    created_by: Optional[int] = None
    created_at: str
    finished_at: Optional[str] = None
    box_count: int = 0
    packed_box_count: int = 0
    total_items: int = 0
    packed_items: int = 0

class BoxCreate(BaseModel):
    move_id: Optional[int] = None
    number: Optional[int] = None
    label: str
    destination: Optional[str] = None
    destination_location_id: Optional[int] = None
    colour: Optional[str] = None
    notes: Optional[str] = None

class BoxUpdate(BaseModel):
    label: Optional[str] = None
    destination: Optional[str] = None
    destination_location_id: Optional[int] = None
    colour: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[BoxStatus] = None

class BoxItemOut(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    location_path: Optional[str] = None

class BoxOut(BaseModel):
    id: int
    move_id: int
    number: int
    label: str
    destination: Optional[str] = None
    destination_location_id: Optional[int] = None
    destination_location_name: Optional[str] = None
    colour: Optional[str] = None
    notes: Optional[str] = None
    status: BoxStatus
    items_count: int = 0
    items: List[BoxItemOut] = []

class BoxUnpackRequest(BaseModel):
    item_ids: List[int]
    location_id: int

# --- Label Templates ---

LabelKind = Literal["item", "location", "box"]

class LabelTemplateCreate(BaseModel):
    name: str
    kind: LabelKind
    width_mm: float
    height_mm: float
    page_json: Optional[str] = None
    layout: str = "qr_left"
    fields_json: str = "[]"
    style_json: Optional[str] = None
    is_default: bool = False

class LabelTemplateUpdate(BaseModel):
    name: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    page_json: Optional[str] = None
    layout: Optional[str] = None
    fields_json: Optional[str] = None
    style_json: Optional[str] = None
    is_default: Optional[bool] = None

class LabelTemplateOut(BaseModel):
    id: int
    name: str
    kind: LabelKind
    width_mm: float
    height_mm: float
    page_json: Optional[str] = None
    layout: str
    fields_json: str
    style_json: Optional[str] = None
    is_default: bool
    owner_id: Optional[int] = None
    created_at: str
    updated_at: str

# --- Wall Display ---

class WallItemOut(BaseModel):
    id: int
    name: str
    since: Optional[str] = None
    due_date: Optional[str] = None
    borrower_name: Optional[str] = None
    is_overdue: bool = False
    thumb_url: Optional[str] = None

class WallResponse(BaseModel):
    overdue: List[ReminderOut] = []
    due_soon: List[ReminderOut] = []
    taken_out: List[WallItemOut] = []
    generated_at: str
    household_name: Optional[str] = None

# --- Second Copy Backup ---

class SecondCopyConfig(BaseModel):
    enabled: bool
    path: Optional[str] = None
    keep: int = 14

class SecondCopyStatus(BaseModel):
    enabled: bool
    path: Optional[str] = None
    keep: int = 14
    last_ok: Optional[str] = None
    last_error: Optional[str] = None
    last_file: Optional[str] = None
    free_space_bytes: Optional[int] = None

class SecondCopyFileOut(BaseModel):
    file_name: str
    size_bytes: int
    modified_at: str

# --- Offline Mode ---

class OfflineSnapshotOut(BaseModel):
    schema_version: int = 10
    timestamp: str
    categories: List[CategoryOut] = []
    locations: List[LocationOut] = []
    items: List[ItemOut] = []
    tags: List[TagOut] = []
    field_defs: List[FieldDefOut] = []
    reminders: List[ReminderOut] = []
    contacts: List[ContactOut] = []

class OfflineChangesOut(BaseModel):
    timestamp: str
    items_changed: List[ItemOut] = []
    items_removed: List[int] = []
