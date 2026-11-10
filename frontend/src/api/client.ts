/**
 * Type-safe API client for HomeInventory.
 */

export interface ApiError {
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

export async function apiFetch<T>(
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

export const api = {
  // Health & Auth
  getHealth: () => apiFetch<{ status: string; time: string }>("/api/health"),
  getAuthStatus: () =>
    apiFetch<{ pin_set: boolean; authenticated: boolean }>("/api/auth/status"),
  setupPin: (pin?: string) =>
    apiFetch<{ ok: boolean; message?: string }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ pin: pin || null }),
    }),
  login: (pin: string) =>
    apiFetch<{ ok: boolean; message?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
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

  // Settings
  getSettings: () => apiFetch<any>("/api/settings"),
  updateSettings: (data: any) =>
    apiFetch<any>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Categories & Fields
  getCategories: () => apiFetch<any[]>("/api/categories"),
  getCategory: (id: number) => apiFetch<any>(`/api/categories/${id}`),
  createCategory: (data: any) =>
    apiFetch<any>("/api/categories", {
      method: "POST",
      body: JSON.stringify(data),
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
  toggleTaken: (id: number, taken_out: boolean, taken_by?: string | null) =>
    apiFetch<any>(`/api/items/${id}/taken`, {
      method: "POST",
      body: JSON.stringify({ taken_out, taken_by }),
    }),
  bulkMove: (item_ids: number[], location_id: number | null) =>
    apiFetch<{ ok: boolean; moved_count: number }>("/api/items/bulk-move", {
      method: "POST",
      body: JSON.stringify({ item_ids, location_id }),
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
};
