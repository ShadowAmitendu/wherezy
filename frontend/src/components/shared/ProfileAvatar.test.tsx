import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

const testTheme = createTheme();

describe("ProfileAvatar", () => {
  it("renders uploaded image img element when avatarUrl is provided", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider theme={testTheme}>
        <ProfileAvatar
          name="Alex"
          color="#1976d2"
          avatarEmoji="Person"
          avatarUrl="/api/profiles/4/avatar?v=abc123.jpg"
          size={64}
        />
      </ThemeProvider>
    );

    expect(html).toContain("<img");
    expect(html).toContain('src="/api/profiles/4/avatar?v=abc123.jpg"');
    expect(html).toContain('alt="Alex profile picture"');
  });

  it("renders fallback account icon svg when avatarUrl is absent", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider theme={testTheme}>
        <ProfileAvatar
          name="Alex"
          color="#1976d2"
          avatarEmoji="Person"
          avatarUrl={null}
          size={64}
        />
      </ThemeProvider>
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  });
});
