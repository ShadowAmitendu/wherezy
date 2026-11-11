import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ICONS,
  EMOJI_TO_ICON_MAP,
  getAccountIconComponent,
} from "./accountIcons";
import { CURATED_ICONS, renderMuiIcon } from "./iconUtils";
import {
  BODY_FONT_FAMILY,
  HEADING_FONT_FAMILY,
  THEME_PRESETS,
} from "../../theme/themeConstants";

describe("accountIcons", () => {
  it("resolves curated names, legacy emojis, case variants, and unknown fallback", () => {
    const fallback = getAccountIconComponent(null);
    expect(getAccountIconComponent("person")).toBe(fallback);
    expect(getAccountIconComponent("Person")).toBe(fallback);

    for (const [emoji, iconName] of Object.entries(EMOJI_TO_ICON_MAP)) {
      expect(getAccountIconComponent(emoji)).toBe(getAccountIconComponent(iconName));
    }

    for (const entry of ACCOUNT_ICONS) {
      expect(getAccountIconComponent(entry.name)).toBeTruthy();
    }

    expect(getAccountIconComponent("nonexistent_icon")).toBe(fallback);
  });
});

describe("iconUtils", () => {
  it("renders distinct elements for curated icons and backend snake_case names", () => {
    const defaultEl = renderMuiIcon("does_not_exist");
    for (const entry of CURATED_ICONS) {
      const el = renderMuiIcon(entry.name);
      expect(el.props.fontSize).toBe("medium");
    }

    const folderEl = renderMuiIcon("create_new_folder", "small");
    expect(folderEl.type).not.toBe(defaultEl.type);
    expect(folderEl.props.fontSize).toBe("small");

    const inboxEl = renderMuiIcon("inbox");
    expect(inboxEl.type).not.toBe(defaultEl.type);
  });
});

describe("themeConstants", () => {
  it("defines Geist and Inter font stacks and 10 complete presets", () => {
    expect(HEADING_FONT_FAMILY).toContain("'Geist'");
    expect(BODY_FONT_FAMILY).toContain("'Inter'");
    const presetValues = Object.values(THEME_PRESETS);
    expect(presetValues).toHaveLength(10);
    for (const preset of presetValues) {
      expect(preset.colors).toHaveLength(5);
    }
  });
});
