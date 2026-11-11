import type { ProfileOut } from "../api/client";

export type GuardProfile = Pick<ProfileOut, "role"> &
  Partial<Pick<ProfileOut, "custom_permissions" | "is_display">>;

export const ROLE_LEVELS: Record<string, number> = {
  admin: 4,
  co_admin: 3,
  member: 2,
  viewer: 1,
};

export const VIEWER_PERMISSIONS = [
  "activity:read",
  "attachments:read",
  "audit:read",
  "categories:read",
  "contacts:read",
  "health:read",
  "items:read",
  "labels:read",
  "locations:read",
  "offline:read",
  "prefs:write_own",
  "reminders:read",
  "search:read",
  "trash:read",
  "wall:read",
] as const;

const VIEWER_PERMISSION_SET: ReadonlySet<string> = new Set(VIEWER_PERMISSIONS);

const VIEWER_ROLES = ["admin", "co_admin", "member", "viewer"] as const;
const MEMBER_ROLES = ["admin", "co_admin", "member"] as const;
const CO_ADMIN_ROLES = ["admin", "co_admin"] as const;
const ADMIN_ROLES = ["admin"] as const;

export const PERMISSIONS: Record<string, readonly string[]> = {
  // Viewer-level reads
  "items:read": VIEWER_ROLES,
  "locations:read": VIEWER_ROLES,
  "categories:read": VIEWER_ROLES,
  "activity:read": VIEWER_ROLES,
  "reminders:read": VIEWER_ROLES,
  "attachments:read": VIEWER_ROLES,
  "audit:read": VIEWER_ROLES,
  "trash:read": VIEWER_ROLES,
  "health:read": VIEWER_ROLES,
  "contacts:read": VIEWER_ROLES,
  "labels:read": VIEWER_ROLES,
  "wall:read": VIEWER_ROLES,
  "offline:read": VIEWER_ROLES,
  "prefs:write_own": VIEWER_ROLES,
  "search:read": VIEWER_ROLES,

  // Member-level operations
  "items:write": MEMBER_ROLES,
  "items:delete": MEMBER_ROLES,
  "photos:write": MEMBER_ROLES,
  "attachments:write": MEMBER_ROLES,
  "tags:write": MEMBER_ROLES,
  "bulk:write": MEMBER_ROLES,
  "audit:write": MEMBER_ROLES,
  "trash:restore": MEMBER_ROLES,
  "inbox:write": MEMBER_ROLES,
  "lifecycle:write": MEMBER_ROLES,
  "health:write": MEMBER_ROLES,
  "contacts:write": MEMBER_ROLES,
  "moves:write": MEMBER_ROLES,
  "labels:write_own": MEMBER_ROLES,
  "activity:revert": MEMBER_ROLES,
  "reminders:write": MEMBER_ROLES,

  // Co-admin-level administration
  "categories:write": CO_ADMIN_ROLES,
  "locations:write": CO_ADMIN_ROLES,
  "templates:write": CO_ADMIN_ROLES,
  "trash:purge": CO_ADMIN_ROLES,
  "profiles:write": CO_ADMIN_ROLES,
  "admin:settings": CO_ADMIN_ROLES,
  "admin:export": CO_ADMIN_ROLES,
  "admin:import": CO_ADMIN_ROLES,
  "contacts:delete": CO_ADMIN_ROLES,
  "labels:write_all": CO_ADMIN_ROLES,
  "admin:book": CO_ADMIN_ROLES,
  "prefs:write_all": CO_ADMIN_ROLES,

  // Admin-only operations
  "admin:backup": ADMIN_ROLES,
  "admin:second_copy": ADMIN_ROLES,
  "admin:webhook": ADMIN_ROLES,
};

const CUSTOM_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  "admin:export": ["export:read"],
  "admin:book": ["export:read"],
  "attachments:write": ["photos:write"],
  "inbox:write": ["items:write"],
  "lifecycle:write": ["items:write"],
};

export interface GuardCheckOptions {
  roles?: readonly string[];
  permission?: string;
  anyPermissions?: readonly string[];
  allPermissions?: readonly string[];
  allowDisplay?: boolean;
}

export function hasRole(
  profile: GuardProfile | null | undefined,
  allowedRoles?: readonly string[]
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!profile) return false;
  return allowedRoles.includes(profile.role);
}

export function hasPermission(
  profile: GuardProfile | null | undefined,
  requirement: string
): boolean {
  if (!profile) return false;

  if (profile.is_display) {
    return requirement === "wall:read";
  }

  if (requirement in ROLE_LEVELS) {
    if (profile.role === "custom") {
      return requirement === "viewer";
    }
    return (ROLE_LEVELS[profile.role] ?? 0) >= ROLE_LEVELS[requirement];
  }

  if (profile.role === "custom") {
    if (VIEWER_PERMISSION_SET.has(requirement)) return true;
    const customPerms = profile.custom_permissions ?? [];
    if (customPerms.includes(requirement)) return true;
    const aliases = CUSTOM_PERMISSION_ALIASES[requirement];
    return Boolean(aliases?.some((alias) => customPerms.includes(alias)));
  }

  const allowedRoles = PERMISSIONS[requirement];
  return Boolean(allowedRoles?.includes(profile.role));
}

export function hasAnyPermission(
  profile: GuardProfile | null | undefined,
  requirements?: readonly string[]
): boolean {
  if (!requirements || requirements.length === 0) return true;
  return requirements.some((req) => hasPermission(profile, req));
}

export function hasAllPermissions(
  profile: GuardProfile | null | undefined,
  requirements?: readonly string[]
): boolean {
  if (!requirements || requirements.length === 0) return true;
  return requirements.every((req) => hasPermission(profile, req));
}

export function isAuthorizedForGuard(
  profile: GuardProfile | null | undefined,
  options: GuardCheckOptions
): boolean {
  if (!profile) return false;
  if (profile.is_display && !options.allowDisplay) return false;
  if (!hasRole(profile, options.roles)) return false;
  if (options.permission && !hasPermission(profile, options.permission)) {
    return false;
  }
  if (!hasAnyPermission(profile, options.anyPermissions)) return false;
  if (!hasAllPermissions(profile, options.allPermissions)) return false;
  return true;
}

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname !== "/login" && pathname !== "/lock";
}

export function getSafeRedirectTarget(state: unknown, fallback = "/"): string {
  const safeFallback = isSafeInternalPath(fallback) ? fallback : "/";
  if (!state || typeof state !== "object" || !("from" in state)) {
    return safeFallback;
  }

  const rawFrom = (state as { from?: unknown }).from;
  if (typeof rawFrom === "string") {
    return isSafeInternalPath(rawFrom) ? rawFrom : safeFallback;
  }

  if (rawFrom && typeof rawFrom === "object") {
    const { pathname, search, hash } = rawFrom as {
      pathname?: unknown;
      search?: unknown;
      hash?: unknown;
    };
    if (typeof pathname === "string") {
      const safeSearch = typeof search === "string" && search.startsWith("?") ? search : "";
      const safeHash = typeof hash === "string" && hash.startsWith("#") ? hash : "";
      const candidate = `${pathname}${safeSearch}${safeHash}`;
      if (isSafeInternalPath(candidate)) {
        return candidate;
      }
    }
  }

  return safeFallback;
}
