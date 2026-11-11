/**
 * Type-safe API client for Wherezy.
 */
import type { Category, FieldType } from "../features/forms/types";

interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiException extends Error {
  error: ApiError;
  status: number;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiException";
    this.status = status;
    this.error = error;
  }
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let errPayload: { error?: ApiError } = {};
    try {
      errPayload = await response.json();
    } catch {
      // Not JSON
    }

    const error: ApiError = errPayload.error || {
      code: `HTTP_${response.status}`,
      message: response.statusText || "Request failed",
    };

    throw new ApiException(response.status, error);
  }

  // Handle empty or file responses
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

interface BulkItemEntryPayload {
  name: string;
  quantity?: number;
  location_id?: number | null;
  expiry_date?: string | null;
  notes?: string | null;
  values?: Record<string, any>;
}

interface BulkCreatePayload {
  category_id: number;
  quantity?: number;
  location_id?: number | null;
  expiry_date?: string | null;
  notes?: string | null;
  values: Record<string, any>;
  items: BulkItemEntryPayload[];
}

interface BulkCreateResult {
  ok: boolean;
  created_count: number;
  batch_id: string;
  items: any[];
}

export interface ImportCsvResult {
  ok: boolean;
  dry_run: boolean;
  total_rows: number;
  imported_count: number;
  errors: string[];
}

export type AiProviderType = "gemini" | "local";

export interface SettingsUpdatePayload {
  expiry_warn_days?: number;
  base_url?: string | null;
  label_preset?: string;
  print_defaults?: {
    include_sub: boolean;
    show_photos: boolean;
    show_audit_box: boolean;
    font_size: string;
  };
  theme?: string;
  backup_keep?: number;
  photo_limit_per_owner?: number;
  ai_provider?: AiProviderType;
  gemini_api_key?: string | null;
  clear_gemini_api_key?: boolean;
  gemini_model?: string | null;
  local_llm_base_url?: string | null;
  local_llm_model?: string | null;
  local_llm_api_key?: string | null;
  clear_local_llm_api_key?: boolean;
  local_llm_stt_model?: string | null;
}

export interface AiLocalModelsResponse {
  ok: boolean;
  base_url: string;
  models: string[];
}

export interface AiConnectionTestPayload {
  provider?: AiProviderType;
  gemini_api_key?: string | null;
  gemini_model?: string | null;
  local_llm_base_url?: string | null;
  local_llm_model?: string | null;
  local_llm_api_key?: string | null;
}

export interface AiConnectionTestResponse {
  ok: boolean;
  provider: AiProviderType;
  model: string;
  latency_ms: number;
  message: string;
}

export interface SettingsResponse {
  expiry_warn_days: number;
  base_url: string | null;
  label_preset: string;
  print_defaults: {
    include_sub: boolean;
    show_photos: boolean;
    show_audit_box: boolean;
    font_size: string;
  };
  theme: string;
  backup_keep: number;
  photo_limit_per_owner: number;
  ai_configured: boolean;
  ai_provider: AiProviderType;
  ai_status_label?: string | null;
  ai_key_source: "env" | "settings" | "none";
  gemini_api_key_hint?: string | null;
  gemini_model?: string | null;
  local_llm_base_url?: string | null;
  local_llm_model?: string | null;
  local_llm_has_api_key?: boolean;
  local_llm_api_key_hint?: string | null;
  local_llm_stt_model?: string | null;
}

export interface AiCategoryFieldPlan {
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[] | null;
  unit?: string | null;
  hint?: string | null;
  show_in_list?: boolean;
}

export interface AiCategoryPlan {
  name: string;
  icon: string;
  color: string;
  track_expiry: boolean;
  expiry_label?: string | null;
  optimization_summary: string;
  fields: AiCategoryFieldPlan[];
}

export interface AiCategoryGenerateResponse {
  created: boolean;
  plan: AiCategoryPlan;
  category?: Category | null;
}

export interface AiCategoryCommitPayload {
  name: string;
  icon: string;
  color: string;
  track_expiry: boolean;
  expiry_label?: string | null;
  fields: AiCategoryFieldPlan[];
}

export interface AiItemSuggestion {
  name: string;
  category_id?: number | null;
  category_name?: string | null;
  location_id?: number | null;
  location_path?: string | null;
  quantity: number;
  expiry_date?: string | null;
  notes?: string | null;
  values: Record<string, any>;
  summary: string;
}

export interface AiItemExtractResponse {
  suggestion: AiItemSuggestion;
}

export interface AiBulkItemDraft {
  name: string;
  category_id?: number | null;
  category_name?: string | null;
  location_id?: number | null;
  location_path?: string | null;
  quantity: number;
  expiry_date?: string | null;
  notes?: string | null;
  values: Record<string, any>;
}

export interface AiBulkExtractResponse {
  summary: string;
  items: AiBulkItemDraft[];
}

export interface AiBulkCommitItem {
  name: string;
  category_id: number;
  location_id?: number | null;
  quantity: number;
  expiry_date?: string | null;
  notes?: string | null;
  values: Record<string, any>;
}

export interface AiBulkCommitResponse {
  ok: boolean;
  created_count: number;
  batch_id: string;
  items: any[];
}

export interface AiLocationNodePlan {
  temp_id: string;
  parent_temp_id?: string | null;
  name: string;
  kind: string;
  storage_only?: boolean;
  notes?: string | null;
}

export interface AiLocationPlan {
  summary: string;
  nodes: AiLocationNodePlan[];
}

export interface AiLocationGenerateResponse {
  created: boolean;
  plan: AiLocationPlan;
  created_locations: any[];
}

export interface AiLocationCommitResponse {
  ok: boolean;
  created_count: number;
  locations: any[];
}

export type ProfileRole = "admin" | "co_admin" | "member" | "viewer" | "custom";

export interface ProfileOut {
  id: number;
  name: string;
  username?: string;
  color: string;
  avatar_emoji: string;
  role: ProfileRole;
  is_active: boolean;
  must_change_password: boolean;
  custom_permissions?: string[] | null;
  accent_color?: string | null;
  language?: string | null;
  text_scale: number;
  high_contrast: boolean;
  theme_mode: string;
  is_display: boolean;
  has_pin: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthStatusResponse {
  pin_set: boolean;
  authenticated: boolean;
  current_profile?: ProfileOut | null;
}

export const api = {
  // Health & Auth
  getHealth: () => apiFetch<{ status: string; time: string }>("/api/health"),
  getAuthStatus: () =>
    apiFetch<AuthStatusResponse>("/api/auth/status"),
  setupPin: (pin?: string) =>
    apiFetch<{ ok: boolean; message?: string }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ pin: pin || null }),
    }),
  login: (credentials: { username?: string; password?: string; pin?: string } | string) => {
    const body = typeof credentials === "string" ? { pin: credentials } : credentials;
    return apiFetch<{ ok: boolean; message?: string; must_change_password?: boolean; profile?: ProfileOut }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updatePassword: (data: { current_password?: string; new_password: string }) =>
    apiFetch<{ ok: boolean; message?: string; profile?: ProfileOut }>("/api/auth/update-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () =>
    apiFetch<{ ok: boolean; message?: string }>("/api/auth/logout", {
      method: "POST",
    }),
  changePin: (current_pin?: string, new_pin?: string) =>
    apiFetch<{ ok: boolean; message?: string }>("/api/auth/change-pin", {
      method: "POST",
      body: JSON.stringify({ current_pin, new_pin }),
    }),

  // Profiles & Users
  getProfiles: (includeInactive = false) =>
    apiFetch<ProfileOut[]>(`/api/profiles?include_inactive=${includeInactive}`),
  getMyProfile: () => apiFetch<ProfileOut>("/api/profiles/me"),
  selectProfile: (profileId: number, pin?: string) =>
    apiFetch<ProfileOut>("/api/profiles/select", {
      method: "POST",
      body: JSON.stringify({ profile_id: profileId, pin: pin || null }),
    }),
  createProfile: (data: any) =>
    apiFetch<ProfileOut>("/api/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProfile: (profileId: number, data: any) =>
    apiFetch<ProfileOut>(`/api/profiles/${profileId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deactivateProfile: (profileId: number) =>
    apiFetch<{ ok: boolean; message?: string }>(`/api/profiles/${profileId}`, {
      method: "DELETE",
    }),
  updateMyPrefs: (data: any) =>
    apiFetch<ProfileOut>("/api/profiles/me/prefs", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Settings
  getSettings: () => apiFetch<SettingsResponse>("/api/settings"),
  updateSettings: (data: SettingsUpdatePayload) =>
    apiFetch<SettingsResponse>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  fetchLocalAiModels: (payload: { base_url?: string | null; api_key?: string | null }) =>
    apiFetch<AiLocalModelsResponse>("/api/ai/config/models", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testAiConnection: (payload: AiConnectionTestPayload) =>
    apiFetch<AiConnectionTestResponse>("/api/ai/config/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Categories & Fields
  getCategories: () => apiFetch<any[]>("/api/categories"),
  getCategory: (id: number) => apiFetch<any>(`/api/categories/${id}`),
  createCategory: (data: any) =>
    apiFetch<any>("/api/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateCategoryWithAi: (payload: {
    prompt?: string;
    audio?: Blob | File | null;
    audioFilename?: string;
    create?: boolean;
  }) => {
    const formData = new FormData();
    if (payload.prompt && payload.prompt.trim()) {
      formData.append("prompt", payload.prompt.trim());
    }
    formData.append("create", String(payload.create ?? true));
    if (payload.audio) {
      const filename =
        payload.audio instanceof File
          ? payload.audio.name
          : payload.audioFilename || "voice_note.webm";
      formData.append("audio", payload.audio, filename);
    }
    return apiFetch<AiCategoryGenerateResponse>("/api/categories/ai/generate", {
      method: "POST",
      body: formData,
    });
  },
  commitAiCategory: (data: AiCategoryCommitPayload) =>
    apiFetch<Category>("/api/categories/ai/commit", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  extractItemWithAi: (payload: {
    prompt?: string;
    audio?: Blob | File | null;
    audioFilename?: string;
    image?: Blob | File | null;
    imageFilename?: string;
    preferredCategoryId?: number | null;
    preferredLocationId?: number | null;
  }) => {
    const formData = new FormData();
    if (payload.prompt && payload.prompt.trim()) {
      formData.append("prompt", payload.prompt.trim());
    }
    if (payload.preferredCategoryId) {
      formData.append("preferred_category_id", String(payload.preferredCategoryId));
    }
    if (payload.preferredLocationId) {
      formData.append("preferred_location_id", String(payload.preferredLocationId));
    }
    if (payload.audio) {
      const fname =
        payload.audio instanceof File
          ? payload.audio.name
          : payload.audioFilename || "voice_note.webm";
      formData.append("audio", payload.audio, fname);
    }
    if (payload.image) {
      const iname =
        payload.image instanceof File
          ? payload.image.name
          : payload.imageFilename || "item_photo.jpg";
      formData.append("image", payload.image, iname);
    }
    return apiFetch<AiItemExtractResponse>("/api/ai/item/extract", {
      method: "POST",
      body: formData,
    });
  },
  analyzeInboxItemWithAi: (
    itemId: number,
    payload?: { prompt?: string; audio?: Blob | File | null; audioFilename?: string }
  ) => {
    const formData = new FormData();
    if (payload?.prompt && payload.prompt.trim()) {
      formData.append("prompt", payload.prompt.trim());
    }
    if (payload?.audio) {
      const fname =
        payload.audio instanceof File
          ? payload.audio.name
          : payload.audioFilename || "voice_note.webm";
      formData.append("audio", payload.audio, fname);
    }
    return apiFetch<AiItemExtractResponse>(`/api/ai/inbox/${itemId}/analyze`, {
      method: "POST",
      body: formData,
    });
  },
  bulkExtractItemsWithAi: (payload: {
    prompt?: string;
    audio?: Blob | File | null;
    audioFilename?: string;
    image?: Blob | File | null;
    imageFilename?: string;
    preferredCategoryId?: number | null;
    preferredLocationId?: number | null;
    lockCategory?: boolean;
  }) => {
    const formData = new FormData();
    if (payload.prompt && payload.prompt.trim()) {
      formData.append("prompt", payload.prompt.trim());
    }
    if (payload.preferredCategoryId) {
      formData.append("preferred_category_id", String(payload.preferredCategoryId));
    }
    if (payload.preferredLocationId) {
      formData.append("preferred_location_id", String(payload.preferredLocationId));
    }
    formData.append("lock_category", String(Boolean(payload.lockCategory)));
    if (payload.audio) {
      const fname =
        payload.audio instanceof File
          ? payload.audio.name
          : payload.audioFilename || "voice_note.webm";
      formData.append("audio", payload.audio, fname);
    }
    if (payload.image) {
      const iname =
        payload.image instanceof File
          ? payload.image.name
          : payload.imageFilename || "shelf_photo.jpg";
      formData.append("image", payload.image, iname);
    }
    return apiFetch<AiBulkExtractResponse>("/api/ai/items/bulk-extract", {
      method: "POST",
      body: formData,
    });
  },
  bulkCommitAiItems: (items: AiBulkCommitItem[]) =>
    apiFetch<AiBulkCommitResponse>("/api/ai/items/bulk-commit", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  generateLocationsWithAi: (payload: {
    prompt?: string;
    audio?: Blob | File | null;
    audioFilename?: string;
    rootParentId?: number | null;
    create?: boolean;
  }) => {
    const formData = new FormData();
    if (payload.prompt && payload.prompt.trim()) {
      formData.append("prompt", payload.prompt.trim());
    }
    if (payload.rootParentId) {
      formData.append("root_parent_id", String(payload.rootParentId));
    }
    formData.append("create", String(Boolean(payload.create)));
    if (payload.audio) {
      const fname =
        payload.audio instanceof File
          ? payload.audio.name
          : payload.audioFilename || "voice_note.webm";
      formData.append("audio", payload.audio, fname);
    }
    return apiFetch<AiLocationGenerateResponse>("/api/ai/locations/generate", {
      method: "POST",
      body: formData,
    });
  },
  commitAiLocations: (payload: {
    root_parent_id?: number | null;
    nodes: AiLocationNodePlan[];
  }) =>
    apiFetch<AiLocationCommitResponse>("/api/ai/locations/commit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCategory: (id: number, data: any) =>
    apiFetch<any>(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    apiFetch<{ ok: boolean; message?: string }>(`/api/categories/${id}`, {
      method: "DELETE",
    }),
  createField: (categoryId: number, data: any) =>
    apiFetch<any>(`/api/categories/${categoryId}/fields`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateField: (fieldId: number, data: any) =>
    apiFetch<any>(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteField: (fieldId: number) =>
    apiFetch<{ ok: boolean; message?: string }>(`/api/fields/${fieldId}`, {
      method: "DELETE",
    }),
  reorderFields: (categoryId: number, field_ids: number[]) =>
    apiFetch<{ ok: boolean }>(`/api/categories/${categoryId}/fields/reorder`, {
      method: "POST",
      body: JSON.stringify({ field_ids }),
    }),

  // Templates
  getTemplates: () => apiFetch<any[]>("/api/templates"),
  applyTemplate: (slug: string) =>
    apiFetch<any>(`/api/templates/${slug}/apply`, { method: "POST" }),

  // Locations
  getLocationsTree: () => apiFetch<any[]>("/api/locations/tree"),
  getLocation: (id: number) => apiFetch<any>(`/api/locations/${id}`),
  createLocation: (data: any) =>
    apiFetch<any>("/api/locations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  addLocationChildren: (id: number, children: Array<{ name: string; kind: string; notes?: string | null }>) =>
    apiFetch<any[]>(`/api/locations/${id}/children`, {
      method: "POST",
      body: JSON.stringify({ children }),
    }),
  updateLocation: (id: number, data: any) =>
    apiFetch<any>(`/api/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteLocation: (id: number) =>
    apiFetch<{ ok: boolean }>(`/api/locations/${id}`, { method: "DELETE" }),
  moveLocation: (id: number, parent_id: number | null) =>
    apiFetch<any>(`/api/locations/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ parent_id }),
    }),
  getLocationItems: (id: number, includeSub = true) =>
    apiFetch<any[]>(`/api/locations/${id}/items?include_sub=${includeSub}`),

  // Items
  getItems: (params: Record<string, any>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        q.set(k, String(v));
      }
    });
    return apiFetch<any>(`/api/items?${q.toString()}`);
  },
  getItem: (id: number) => apiFetch<any>(`/api/items/${id}`),
  createItem: (data: any) =>
    apiFetch<any>("/api/items", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateItem: (id: number, data: any) =>
    apiFetch<any>(`/api/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteItem: (id: number) =>
    apiFetch<{ ok: boolean; message?: string }>(`/api/items/${id}`, {
      method: "DELETE",
    }),
  restoreItem: (id: number) =>
    apiFetch<any>(`/api/items/${id}/restore`, { method: "POST" }),
  duplicateItem: (id: number) =>
    apiFetch<any>(`/api/items/${id}/duplicate`, { method: "POST" }),
  moveItem: (id: number, location_id: number | null) =>
    apiFetch<any>(`/api/items/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ location_id }),
    }),
  toggleTaken: (
    id: number,
    optionsOrTakenOut:
      | boolean
      | { taken_out?: boolean; taken_out_quantity?: number; taken_by?: string | null; taken_due?: string | null },
    taken_by?: string | null
  ) => {
    const body =
      typeof optionsOrTakenOut === "boolean"
        ? { taken_out: optionsOrTakenOut, taken_by }
        : optionsOrTakenOut;
    return apiFetch<any>(`/api/items/${id}/taken`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  bulkMove: (item_ids: number[], location_id: number | null) =>
    apiFetch<{ ok: boolean; moved_count: number }>("/api/items/bulk-move", {
      method: "POST",
      body: JSON.stringify({ item_ids, location_id }),
    }),
  bulkCreate: (data: BulkCreatePayload) =>
    apiFetch<BulkCreateResult>("/api/items/bulk-create", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getExpiring: (within_days?: number) =>
    apiFetch<any[]>(
      `/api/expiring${within_days ? `?within_days=${within_days}` : ""}`
    ),

  // Photos
  uploadPhoto: (owner_type: "item" | "location", owner_id: number, file: File) => {
    const formData = new FormData();
    formData.append("owner_type", owner_type);
    formData.append("owner_id", String(owner_id));
    formData.append("file", file);
    return apiFetch<any>("/api/photos", {
      method: "POST",
      body: formData,
    });
  },
  setCoverPhoto: (photoId: number) =>
    apiFetch<any>(`/api/photos/${photoId}/cover`, { method: "PUT" }),
  deletePhoto: (photoId: number) =>
    apiFetch<{ ok: boolean }>(`/api/photos/${photoId}`, { method: "DELETE" }),
  reorderPhotos: (photo_ids: number[]) =>
    apiFetch<{ ok: boolean }>("/api/photos/reorder", {
      method: "POST",
      body: JSON.stringify({ photo_ids }),
    }),

  // Codes
  resolveCode: (code: string) =>
    apiFetch<any>(`/api/codes/resolve?code=${encodeURIComponent(code)}`),

  // Dashboard
  getDashboard: () => apiFetch<any>("/api/dashboard"),

  // Admin
  getStorage: () => apiFetch<any>("/api/admin/storage"),
  getBackups: () => apiFetch<any[]>("/api/admin/backups"),
  restoreBackup: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<{ ok: boolean; message: string }>("/api/admin/restore", {
      method: "POST",
      body: formData,
    });
  },
  importCsv: (
    categoryId: number,
    file: File,
    options?: { dryRun?: boolean; locationId?: number | null }
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      category_id: String(categoryId),
      dry_run: String(options?.dryRun ?? true),
    });
    if (options?.locationId) {
      params.set("location_id", String(options.locationId));
    }
    return apiFetch<ImportCsvResult>(`/api/admin/import-csv?${params.toString()}`, {
      method: "POST",
      body: formData,
    });
  },

  // --- v2 Additions ---

  // Activity History
  getActivity: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    });
    return apiFetch<any>(`/api/activity?${q.toString()}`);
  },
  getItemActivity: (itemId: number) => apiFetch<any[]>(`/api/items/${itemId}/activity`),
  getLocationActivity: (locationId: number) => apiFetch<any[]>(`/api/locations/${locationId}/activity`),
  revertActivity: (activityId: number) =>
    apiFetch<any>(`/api/activity/${activityId}/revert`, { method: "POST" }),

  // Tags
  getTags: () => apiFetch<any[]>("/api/tags"),
  createTag: (data: { name: string; color?: string }) =>
    apiFetch<any>("/api/tags", { method: "POST", body: JSON.stringify(data) }),
  updateTag: (tagId: number, data: { name?: string; color?: string }) =>
    apiFetch<any>(`/api/tags/${tagId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTag: (tagId: number) =>
    apiFetch<{ ok: boolean }>(`/api/tags/${tagId}`, { method: "DELETE" }),
  mergeTag: (sourceTagId: number, targetTagId: number) =>
    apiFetch<{ ok: boolean }>(`/api/tags/${sourceTagId}/merge`, {
      method: "POST",
      body: JSON.stringify({ target_tag_id: targetTagId }),
    }),
  setItemTags: (itemId: number, tag_ids: number[]) =>
    apiFetch<{ ok: boolean }>(`/api/tags/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify({ tag_ids }),
    }),

  // Bulk Operations
  bulkItems: (data: any) =>
    apiFetch<any>("/api/items/bulk", { method: "POST", body: JSON.stringify(data) }),
  bulkItemsPreview: (data: any) =>
    apiFetch<any>("/api/items/bulk/preview", { method: "POST", body: JSON.stringify(data) }),
  undoBatch: (batchId: string) =>
    apiFetch<any>(`/api/batches/${batchId}/undo`, { method: "POST" }),

  // Reminders
  getReminders: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) q.set(k, String(v));
    });
    return apiFetch<any[]>(`/api/reminders?${q.toString()}`);
  },
  getRemindersCount: () => apiFetch<{ overdue: number; due_soon: number; total: number }>("/api/reminders/count"),
  snoozeReminder: (data: any) =>
    apiFetch<{ ok: boolean }>("/api/reminders/snooze", { method: "POST", body: JSON.stringify(data) }),
  dismissReminder: (data: any) =>
    apiFetch<{ ok: boolean }>("/api/reminders/dismiss", { method: "POST", body: JSON.stringify(data) }),
  testWebhook: () => apiFetch<any>("/api/admin/webhook-test", { method: "POST" }),

  // Attachments
  uploadAttachment: (itemId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<any>(`/api/items/${itemId}/attachments`, {
      method: "POST",
      body: formData,
    });
  },
  renameAttachment: (attachmentId: number, file_name: string) =>
    apiFetch<any>(`/api/attachments/${attachmentId}`, {
      method: "PUT",
      body: JSON.stringify({ file_name }),
    }),
  deleteAttachment: (attachmentId: number) =>
    apiFetch<{ ok: boolean }>(`/api/attachments/${attachmentId}`, { method: "DELETE" }),

  // Shelf Audit
  startAudit: (locationId: number, includeSub = true) =>
    apiFetch<any>("/api/audits", {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, include_sub: includeSub }),
    }),
  getAudit: (auditId: number) => apiFetch<any>(`/api/audits/${auditId}`),
  updateAuditFound: (auditId: number, found_item_ids: number[]) =>
    apiFetch<any>(`/api/audits/${auditId}/found`, {
      method: "PUT",
      body: JSON.stringify({ found_item_ids }),
    }),
  finishAudit: (auditId: number) =>
    apiFetch<any>(`/api/audits/${auditId}/finish`, { method: "POST" }),
  getLocationAudits: (locationId: number) =>
    apiFetch<any[]>(`/api/locations/${locationId}/audits`),

  // Trash
  getTrash: () => apiFetch<any[]>("/api/trash"),
  restoreTrash: (itemType: string, targetId: number, newLocationId?: number | null) =>
    apiFetch<{ ok: boolean }>(`/api/trash/${itemType}/${targetId}/restore`, {
      method: "POST",
      body: JSON.stringify({ new_location_id: newLocationId || null }),
    }),
  purgeTrash: (itemType: string, targetId: number) =>
    apiFetch<{ ok: boolean }>(`/api/trash/${itemType}/${targetId}`, { method: "DELETE" }),
  emptyTrash: () => apiFetch<{ ok: boolean }>("/api/trash/empty", { method: "POST" }),

  // Quick Search
  quickSearch: (q: string) =>
    apiFetch<any>(`/api/search/quick?q=${encodeURIComponent(q)}`),

  // Inbox & Quick Capture
  quickCapture: (photos: File[], name?: string, location_id?: number | null) => {
    const formData = new FormData();
    photos.forEach((p) => formData.append("photos", p));
    if (name) formData.append("name", name);
    if (location_id) formData.append("location_id", String(location_id));
    return apiFetch<any>("/api/inbox", { method: "POST", body: formData });
  },
  getInboxItems: () => apiFetch<any[]>("/api/inbox"),
  sortInboxItem: (itemId: number, data: any) =>
    apiFetch<{ ok: boolean }>(`/api/inbox/${itemId}/sort`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  bulkInboxAction: (ids: number[], action: string, params: any = {}) =>
    apiFetch<{ ok: boolean }>("/api/inbox/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action, params }),
    }),
  deleteInboxItem: (itemId: number) =>
    apiFetch<{ ok: boolean }>(`/api/inbox/${itemId}`, { method: "DELETE" }),

  // Lifecycle (Retire & Unretire)
  retireItem: (itemId: number, reason: string, date: string, note?: string) =>
    apiFetch<{ ok: boolean }>(`/api/items/${itemId}/retire`, {
      method: "POST",
      body: JSON.stringify({ reason, date, note }),
    }),
  unretireItem: (itemId: number, location_id?: number | null) =>
    apiFetch<{ ok: boolean }>(`/api/items/${itemId}/unretire`, {
      method: "POST",
      body: JSON.stringify({ location_id: location_id || null }),
    }),

  // Data Health
  getHealthOverview: () => apiFetch<any>("/api/health"),
  getHealthItems: (checkName: string) => apiFetch<any[]>(`/api/health/${checkName}`),
  ignoreHealthFinding: (check_key: string, item_id: number, other_item_id?: number | null) =>
    apiFetch<{ ok: boolean }>("/api/health/ignore", {
      method: "POST",
      body: JSON.stringify({ check_key, item_id, other_item_id: other_item_id || null }),
    }),
  deleteHealthIgnore: (ignoreId: number) =>
    apiFetch<{ ok: boolean }>(`/api/health/ignore/${ignoreId}`, { method: "DELETE" }),

  // Contacts & Lending
  getContacts: (include_inactive = false) =>
    apiFetch<any[]>(`/api/contacts?include_inactive=${include_inactive}`),
  createContact: (data: { name: string; phone?: string; note?: string }) =>
    apiFetch<any>("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
  updateContact: (contactId: number, data: any) =>
    apiFetch<any>(`/api/contacts/${contactId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteContact: (contactId: number) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/contacts/${contactId}`, { method: "DELETE" }),
  getContactLoans: (contactId: number) => apiFetch<any>(`/api/contacts/${contactId}/loans`),

  // Moving House
  getMoves: () => apiFetch<any[]>("/api/moves"),
  createMove: (data: { name: string; target_date?: string }) =>
    apiFetch<any>("/api/moves", { method: "POST", body: JSON.stringify(data) }),
  updateMove: (moveId: number, data: any) =>
    apiFetch<any>(`/api/moves/${moveId}`, { method: "PUT", body: JSON.stringify(data) }),
  finishMove: (moveId: number) =>
    apiFetch<any>(`/api/moves/${moveId}/finish`, { method: "POST" }),
  getBoxes: (moveId: number) => apiFetch<any[]>(`/api/moves/${moveId}/boxes`),
  createBox: (moveId: number, data: any) =>
    apiFetch<any>(`/api/moves/${moveId}/boxes`, { method: "POST", body: JSON.stringify(data) }),
  getBox: (boxId: number) => apiFetch<any>(`/api/boxes/${boxId}`),
  updateBox: (boxId: number, data: any) =>
    apiFetch<any>(`/api/boxes/${boxId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBox: (boxId: number) =>
    apiFetch<{ ok: boolean }>(`/api/boxes/${boxId}`, { method: "DELETE" }),
  addItemsToBox: (boxId: number, item_ids: number[]) =>
    apiFetch<{ ok: boolean }>(`/api/boxes/${boxId}/items`, {
      method: "POST",
      body: JSON.stringify(item_ids),
    }),
  removeItemFromBox: (boxId: number, itemId: number) =>
    apiFetch<{ ok: boolean }>(`/api/boxes/${boxId}/items/${itemId}`, { method: "DELETE" }),
  packBox: (boxId: number) => apiFetch<{ ok: boolean }>(`/api/boxes/${boxId}/pack`, { method: "POST" }),
  unpackBox: (boxId: number, item_ids: number[], location_id: number) =>
    apiFetch<{ ok: boolean }>(`/api/boxes/${boxId}/unpack`, {
      method: "POST",
      body: JSON.stringify({ item_ids, location_id }),
    }),

  // Labels
  getLabelTemplates: (kind?: string) =>
    apiFetch<any[]>(`/api/label-templates${kind ? `?kind=${kind}` : ""}`),
  createLabelTemplate: (data: any) =>
    apiFetch<any>("/api/label-templates", { method: "POST", body: JSON.stringify(data) }),
  updateLabelTemplate: (templateId: number, data: any) =>
    apiFetch<any>(`/api/label-templates/${templateId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLabelTemplate: (templateId: number) =>
    apiFetch<{ ok: boolean }>(`/api/label-templates/${templateId}`, { method: "DELETE" }),
  setDefaultLabelTemplate: (templateId: number) =>
    apiFetch<{ ok: boolean }>(`/api/label-templates/${templateId}/default`, { method: "POST" }),

  // Book Export Data
  getBookData: (groupBy = "location", includeRetired = false) =>
    apiFetch<any>(`/api/admin/export/book-data?group_by=${groupBy}&include_retired=${includeRetired}`),

  // Wall Display Data
  getWallData: () => apiFetch<any>("/api/wall"),

  // Second-Copy Backup
  getSecondCopyStatus: () => apiFetch<any>("/api/admin/second-copy"),
  updateSecondCopyConfig: (data: any) =>
    apiFetch<any>("/api/admin/second-copy", { method: "PUT", body: JSON.stringify(data) }),
  testSecondCopyFolder: () => apiFetch<{ ok: boolean; message: string }>("/api/admin/second-copy/test", { method: "POST" }),
  runSecondCopy: () => apiFetch<{ ok: boolean; message: string }>("/api/admin/second-copy/run", { method: "POST" }),
  getSecondCopyFiles: () => apiFetch<any[]>("/api/admin/second-copy/files"),

  // Offline Sync
  getOfflineSnapshot: () => apiFetch<any>("/api/offline/snapshot"),
  getOfflineChanges: (cursor: string) => apiFetch<any>(`/api/offline/changes?cursor=${encodeURIComponent(cursor)}`),
};
