import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextType } from "../../auth/useAuth";
import { SettingsPage } from "./SettingsPage";

const adminAuth: AuthContextType = {
  authenticated: true,
  pinSet: true,
  currentProfile: {
    id: 1,
    name: "Admin",
    username: "admin",
    color: "#1976d2",
    avatar_emoji: "person",
    avatar_url: null,
    role: "admin",
    is_active: true,
    is_display: false,
    has_pin: true,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    text_scale: 100,
    high_contrast: false,
    theme_mode: "light",
    must_change_password: false,
  },
  isLoading: false,
  mustChangePassword: false,
  setMustChangePassword: () => {},
  login: async () => {},
  logout: async () => {},
  selectProfile: async () => {
    throw new Error("unused");
  },
  refreshAuth: async () => {},
};

describe("SettingsPage Data Export & Import dropdowns", () => {
  it("renders unified Export and Import dropdown triggers instead of flat format buttons", () => {
    const html = renderToStaticMarkup(
      <AuthContext.Provider value={adminAuth}>
        <SettingsPage />
      </AuthContext.Provider>
    );

    expect(html).toContain("Data Export &amp; Import");
    expect(html).toContain(">Export<");
    expect(html).toContain(">Import<");
    expect(html).not.toContain("Export as CSV");
    expect(html).not.toContain("Export as JSON");
    expect(html).not.toContain("Export Excel (.xlsx)");
    expect(html).not.toContain("Import Items (CSV)");
  });

  it("hides admin-restricted settings, backups, and export/import from member profiles", () => {
    const memberAuth: AuthContextType = {
      ...adminAuth,
      currentProfile: {
        ...adminAuth.currentProfile!,
        id: 2,
        name: "Member",
        username: "member",
        role: "member",
      },
    };
    const html = renderToStaticMarkup(
      <AuthContext.Provider value={memberAuth}>
        <SettingsPage />
      </AuthContext.Provider>
    );

    expect(html).toContain("Household Security (PIN)");
    expect(html).toContain("Appearance &amp; Theme");
    expect(html).not.toContain("Server Address for QR Codes");
    expect(html).not.toContain("AI Assistant Provider");
    expect(html).not.toContain("Backups &amp; Storage");
    expect(html).not.toContain("Data Export &amp; Import");
  });

  it("lets co_admin view storage stats and export/import without exposing admin-only backups", () => {
    const coAdminAuth: AuthContextType = {
      ...adminAuth,
      currentProfile: {
        ...adminAuth.currentProfile!,
        id: 3,
        name: "CoAdmin",
        username: "coadmin",
        role: "co_admin",
      },
    };
    const html = renderToStaticMarkup(
      <AuthContext.Provider value={coAdminAuth}>
        <SettingsPage />
      </AuthContext.Provider>
    );

    expect(html).toContain("AI Assistant Provider");
    expect(html).toContain("Data Export &amp; Import");
    expect(html).toContain(">Export<");
    expect(html).toContain(">Import<");
    expect(html).toContain("Backups &amp; Storage");
    expect(html).not.toContain("Download Backup (.zip)");
    expect(html).not.toContain("Restore Backup (.zip)");
  });
});
