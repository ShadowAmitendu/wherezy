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

class AuthSetupRequest(BaseModel):
    pin: Optional[str] = None

class AuthLoginRequest(BaseModel):
    pin: str

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

class BulkMoveRequest(BaseModel):
    item_ids: List[int]
    location_id: Optional[int] = None

class BulkMoveResponse(BaseModel):
    ok: bool = True
    moved_count: int

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
    expiry_date: Optional[str] = None
    expiry_status: Optional[ExpiryStatus] = None
    notes: Optional[str] = None
    values: Dict[str, Any] = Field(default_factory=dict)
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
