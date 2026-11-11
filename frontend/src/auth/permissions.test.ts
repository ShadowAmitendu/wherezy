import { describe, expect, it, vi } from "vitest";
import {
  getSafeRedirectTarget,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
  isAuthorizedForGuard,
  type GuardProfile,
} from "./permissions";
import { handleHttpUnauthorized, setUnauthorizedHandler } from "../api/client";

describe("permissions RBAC parity", () => {
  const admin: GuardProfile = { role: "admin", is_display: false };
  const coAdmin: GuardProfile = { role: "co_admin", is_display: false };
  const member: GuardProfile = { role: "member", is_display: false };
  const viewer: GuardProfile = { role: "viewer", is_display: false };
  const display: GuardProfile = { role: "viewer", is_display: true };

  it("enforces role hierarchy accurately", () => {
    expect(hasPermission(admin, "admin:backup")).toBe(true);
    expect(hasPermission(admin, "admin:settings")).toBe(true);
    expect(hasPermission(coAdmin, "profiles:write")).toBe(true);
    expect(hasPermission(coAdmin, "admin:export")).toBe(true);
    expect(hasPermission(coAdmin, "admin:backup")).toBe(false);

    expect(hasPermission(member, "items:write")).toBe(true);
    expect(hasPermission(member, "admin:settings")).toBe(false);
    expect(hasPermission(member, "profiles:write")).toBe(false);

    expect(hasPermission(viewer, "items:read")).toBe(true);
    expect(hasPermission(viewer, "items:write")).toBe(false);
    expect(hasPermission(viewer, "viewer")).toBe(true);
    expect(hasPermission(viewer, "member")).toBe(false);
  });

  it("locks display-kiosk profiles strictly to wall:read", () => {
    expect(hasPermission(display, "wall:read")).toBe(true);
    expect(hasPermission(display, "items:read")).toBe(false);
    expect(hasPermission(display, "admin:settings")).toBe(false);
    expect(isAuthorizedForGuard(display, { allowDisplay: false })).toBe(false);
    expect(
      isAuthorizedForGuard(display, { allowDisplay: true, permission: "wall:read" })
    ).toBe(true);
  });

  it("supports custom roles and legacy permission aliases", () => {
    const customExporter: GuardProfile = {
      role: "custom",
      custom_permissions: ["export:read", "photos:write", "items:write"],
      is_display: false,
    };

    // Viewer permissions are implicitly granted to custom profiles
    expect(hasPermission(customExporter, "items:read")).toBe(true);
    expect(hasPermission(customExporter, "viewer")).toBe(true);

    // Alias mappings match backend permissions.py
    expect(hasPermission(customExporter, "admin:export")).toBe(true);
    expect(hasPermission(customExporter, "admin:book")).toBe(true);
    expect(hasPermission(customExporter, "attachments:write")).toBe(true);
    expect(hasPermission(customExporter, "inbox:write")).toBe(true);
    expect(hasPermission(customExporter, "lifecycle:write")).toBe(true);

    // Unlisted admin permissions remain denied
    expect(hasPermission(customExporter, "admin:import")).toBe(false);
    expect(hasPermission(customExporter, "profiles:write")).toBe(false);
  });

  it("evaluates hasRole, hasAnyPermission, and hasAllPermissions", () => {
    expect(hasRole(coAdmin, ["admin", "co_admin"])).toBe(true);
    expect(hasRole(member, ["admin", "co_admin"])).toBe(false);
    expect(hasRole(null, ["admin"])).toBe(false);

    expect(hasAnyPermission(member, ["admin:settings", "items:write"])).toBe(true);
    expect(hasAllPermissions(member, ["items:read", "items:write"])).toBe(true);
    expect(hasAllPermissions(member, ["items:write", "profiles:write"])).toBe(false);
  });
});

describe("getSafeRedirectTarget", () => {
  it("preserves pathname, query parameters, and hash for safe internal routes", () => {
    expect(
      getSafeRedirectTarget({
        from: { pathname: "/items", search: "?selected=42", hash: "#details" },
      })
    ).toBe("/items?selected=42#details");

    expect(getSafeRedirectTarget({ from: "/l/7?scan=1" })).toBe("/l/7?scan=1");
  });

  it("blocks open-redirect and auth-loop targets", () => {
    expect(getSafeRedirectTarget({ from: "https://evil.example/phish" })).toBe("/");
    expect(getSafeRedirectTarget({ from: "//evil.example" })).toBe("/");
    expect(getSafeRedirectTarget({ from: { pathname: "//evil.example" } })).toBe("/");
    expect(getSafeRedirectTarget({ from: { pathname: "/login" } })).toBe("/");
    expect(getSafeRedirectTarget({ from: { pathname: "/lock" } })).toBe("/");
  });
});

describe("401 unauthorized session handler", () => {
  it("notifies listener for session expiry on app APIs and skips login/PIN forms", () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    try {
      handleHttpUnauthorized("/api/items", 401);
      handleHttpUnauthorized("/api/admin/import/template?format=csv", 401);
      expect(handler).toHaveBeenCalledTimes(2);

      // Login/PIN endpoints return 401 for bad credentials without clearing global listener state
      handleHttpUnauthorized("/api/auth/login", 401);
      handleHttpUnauthorized("/api/auth/change-pin", 401);
      handleHttpUnauthorized("/api/auth/update-password", 401);
      handleHttpUnauthorized("/api/profiles/select", 401);
      expect(handler).toHaveBeenCalledTimes(2);

      // Non-401 status codes do not trigger session reset
      handleHttpUnauthorized("/api/admin/settings", 403);
      handleHttpUnauthorized("/api/items", 500);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      setUnauthorizedHandler(null);
    }
  });
});
