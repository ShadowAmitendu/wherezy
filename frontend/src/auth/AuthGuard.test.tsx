import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ProfileOut } from "../api/client";
import { AuthGuard, type AuthGuardProps } from "./AuthGuard";
import { AuthContext, type AuthContextType } from "./useAuth";

function makeProfile(overrides: Partial<ProfileOut> = {}): ProfileOut {
  return {
    id: 1,
    name: "Test User",
    username: "testuser",
    color: "#486B85",
    avatar_emoji: "Person",
    role: "member",
    is_active: true,
    must_change_password: false,
    custom_permissions: null,
    text_scale: 100,
    high_contrast: false,
    theme_mode: "system",
    is_display: false,
    has_pin: false,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    ...overrides,
  };
}

const baseAuth: AuthContextType = {
  authenticated: false,
  pinSet: true,
  currentProfile: null,
  isLoading: false,
  mustChangePassword: false,
  setMustChangePassword: () => {},
  login: async () => {},
  logout: async () => {},
  selectProfile: async () => makeProfile(),
  refreshAuth: async () => {},
};

function renderGuardRoute(
  guardProps: AuthGuardProps,
  authOverrides: Partial<AuthContextType>,
  initialPath = "/protected"
): string {
  const authValue: AuthContextType = { ...baseAuth, ...authOverrides };
  return renderToStaticMarkup(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AuthGuard {...guardProps} />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("AuthGuard", () => {
  it("redirects unauthenticated visitors in route mode instead of rendering protected content", () => {
    const html = renderGuardRoute({}, { authenticated: false, isLoading: false });
    expect(html).not.toContain("Protected Content");
    expect(html).not.toContain("Access Restricted");
  });

  it("renders protected route content for authorized profiles", () => {
    const html = renderGuardRoute(
      { permission: "profiles:write" },
      {
        authenticated: true,
        isLoading: false,
        currentProfile: makeProfile({ name: "Alex Admin", role: "co_admin" }),
      }
    );
    expect(html).toContain("Protected Content");
    expect(html).not.toContain("Access Restricted");
  });

  it("renders a 403 Access Restricted view when authenticated user lacks required permission", () => {
    const html = renderGuardRoute(
      { permission: "profiles:write" },
      {
        authenticated: true,
        isLoading: false,
        currentProfile: makeProfile({ name: "Sam Member", role: "member" }),
      }
    );
    expect(html).not.toContain("Protected Content");
    expect(html).toContain("Access Restricted");
    expect(html).toContain("Sam Member");
    expect(html).toContain("Role: member");
    expect(html).toContain("Go to Dashboard");
    expect(html).toContain("Switch Profile");
  });

  it("allows custom roles with explicit or aliased permissions", () => {
    const html = renderGuardRoute(
      { permission: "profiles:write" },
      {
        authenticated: true,
        isLoading: false,
        currentProfile: makeProfile({
          role: "custom",
          custom_permissions: ["profiles:write"],
        }),
      }
    );
    expect(html).toContain("Protected Content");
  });

  it("redirects display-kiosk profiles away from standard routes but allows allowDisplay routes", () => {
    const kiosk = makeProfile({ role: "viewer", is_display: true });

    const blockedHtml = renderGuardRoute(
      {},
      { authenticated: true, isLoading: false, currentProfile: kiosk }
    );
    expect(blockedHtml).not.toContain("Protected Content");

    const allowedHtml = renderGuardRoute(
      { allowDisplay: true, loginPath: "/lock" },
      { authenticated: true, isLoading: false, currentProfile: kiosk }
    );
    expect(allowedHtml).toContain("Protected Content");
  });

  it("redirects authenticated users away from guestOnly routes", () => {
    const guestHtml = renderGuardRoute(
      { guestOnly: true },
      { authenticated: false, isLoading: false }
    );
    expect(guestHtml).toContain("Protected Content");

    const authedHtml = renderGuardRoute(
      { guestOnly: true },
      { authenticated: true, isLoading: false, currentProfile: makeProfile() }
    );
    expect(authedHtml).not.toContain("Protected Content");
  });

  it("gates inline children and renders optional fallback without navigating", () => {
    const authAdmin: AuthContextType = {
      ...baseAuth,
      authenticated: true,
      currentProfile: makeProfile({ role: "admin" }),
    };
    const authViewer: AuthContextType = {
      ...baseAuth,
      authenticated: true,
      currentProfile: makeProfile({ role: "viewer" }),
    };

    const allowedInline = renderToStaticMarkup(
      <AuthContext.Provider value={authAdmin}>
        <MemoryRouter>
          <AuthGuard permission="admin:backup" fallback={<span>Denied</span>}>
            <button type="button">Backup Now</button>
          </AuthGuard>
        </MemoryRouter>
      </AuthContext.Provider>
    );
    expect(allowedInline).toContain("Backup Now");
    expect(allowedInline).not.toContain("Denied");

    const deniedInline = renderToStaticMarkup(
      <AuthContext.Provider value={authViewer}>
        <MemoryRouter>
          <AuthGuard permission="admin:backup" fallback={<span>Denied</span>}>
            <button type="button">Backup Now</button>
          </AuthGuard>
        </MemoryRouter>
      </AuthContext.Provider>
    );
    expect(deniedInline).not.toContain("Backup Now");
    expect(deniedInline).toContain("Denied");
  });
});
