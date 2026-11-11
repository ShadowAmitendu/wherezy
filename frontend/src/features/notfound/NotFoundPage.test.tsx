import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextType } from "../../auth/useAuth";
import { NotFoundPage } from "./NotFoundPage";
import { getHashRedirectForDirectPath } from "./routeUtils";

const baseAuth: AuthContextType = {
  authenticated: false,
  pinSet: true,
  currentProfile: null,
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

function renderAtPath(initialEntry: string, authOverrides: Partial<AuthContextType> = {}): string {
  const authValue: AuthContextType = { ...baseAuth, ...authOverrides };
  return renderToStaticMarkup(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("NotFoundPage", () => {
  it("renders 404 details and sign-in actions for unauthenticated visitors", () => {
    const html = renderAtPath("/missing/shelf?tab=2", {
      authenticated: false,
      isLoading: false,
    });

    expect(html).toContain("HTTP 404");
    expect(html).toContain("404");
    expect(html).toContain("Page not found");
    expect(html).toContain("/missing/shelf?tab=2");
    expect(html).toContain("Sign In to Continue");
    expect(html).toContain("Profile Picker");
    expect(html).toContain("Go Back");
  });

  it("renders dashboard, items, and scan shortcuts when signed in", () => {
    const html = renderAtPath("/unknown-route", {
      authenticated: true,
      isLoading: false,
    });

    expect(html).toContain("Back to Dashboard");
    expect(html).toContain("Browse Items");
    expect(html).toContain("Scan QR");
    expect(html).toContain("/unknown-route");
    expect(html).not.toContain("Sign In to Continue");
  });

  it("omits redundant /404 path badge when visited directly", () => {
    const html = renderAtPath("/404", {
      authenticated: true,
      isLoading: false,
    });

    expect(html).toContain("Page not found");
    expect(html).not.toContain("<code>/404</code>");
  });
});

describe("getHashRedirectForDirectPath", () => {
  it("normalizes direct non-root browser URLs into HashRouter paths", () => {
    expect(getHashRedirectForDirectPath("/missing", "?tab=2", "")).toBe(
      "/#/missing?tab=2",
    );
    expect(getHashRedirectForDirectPath("/", "", "")).toBeNull();
    expect(getHashRedirectForDirectPath("/index.html", "", "")).toBeNull();
    expect(getHashRedirectForDirectPath("/missing", "", "#/items")).toBeNull();
  });
});
