import React from "react";
import { describe, expect, it } from "vitest";
import { AccountIcon } from "./AccountIcon";
import {
  ACCOUNT_ICONS,
  hasCuratedAccountIcon,
  resolveAccountIconName,
} from "./accountIcons";
import {
  CURATED_ICONS,
  hasCuratedCategoryIcon,
  renderMuiIcon,
} from "./iconUtils";
import { LazyMaterialIcon } from "./LazyMaterialIcon";
import {
  formatMaterialIconLabel,
  getCachedMaterialIconEntry,
  loadMaterialIconCatalog,
  normalizeMaterialIconKey,
  searchMaterialIcons,
} from "./materialIconCatalog";

describe("materialIconCatalog", () => {
  it("normalizes icon keys consistently across naming styles", () => {
    expect(normalizeMaterialIconKey("RocketLaunch")).toBe("rocketlaunch");
    expect(normalizeMaterialIconKey("rocket_launch")).toBe("rocketlaunch");
    expect(normalizeMaterialIconKey("rocket-launch")).toBe("rocketlaunch");
    expect(normalizeMaterialIconKey("  coffee_maker ")).toBe("coffeemaker");
  });

  it("formats PascalCase Material icon names into human-readable labels", () => {
    expect(formatMaterialIconLabel("RocketLaunch")).toBe("Rocket Launch");
    expect(formatMaterialIconLabel("CoffeeMaker")).toBe("Coffee Maker");
    expect(formatMaterialIconLabel("Inventory2")).toBe("Inventory 2");
    expect(formatMaterialIconLabel("AdminPanelSettings")).toBe(
      "Admin Panel Settings",
    );
  });

  it("loads the full bundled Material Icons catalog and supports ranked search", async () => {
    const entries = await loadMaterialIconCatalog();
    expect(entries.length).toBeGreaterThan(2000);

    // Single-path icon and multi-primitive icon both indexed
    const rocket = getCachedMaterialIconEntry("rocket_launch");
    expect(rocket?.name).toBe("RocketLaunch");
    expect(typeof rocket?.shape).toBe("string");

    const bathtub = getCachedMaterialIconEntry("Bathtub");
    expect(bathtub?.name).toBe("Bathtub");
    expect(Array.isArray(bathtub?.shape)).toBe(true);

    // Search finds custom icons with exact/prefix matches ranked first
    const coffeeResults = searchMaterialIcons("coffee maker");
    expect(coffeeResults[0]?.name).toBe("CoffeeMaker");

    const guitarOrMusicResults = searchMaterialIcons("piano");
    expect(guitarOrMusicResults.some((item) => item.name === "Piano")).toBe(
      true,
    );

    expect(searchMaterialIcons("definitely_no_such_icon_xyz")).toEqual([]);

    for (const iconKey of [
      "celebration",
      "templehindu",
      "kingbed",
      "diamond",
      "power",
      "umbrella",
      "checkroom",
    ]) {
      expect(getCachedMaterialIconEntry(iconKey)).not.toBeNull();
    }
  });
});

describe("expanded curated icon sets and lazy fallback", () => {
  it("exposes deduplicated expanded curated category icons", () => {
    expect(CURATED_ICONS.length).toBeGreaterThanOrEqual(60);
    const keys = CURATED_ICONS.map((item) => normalizeMaterialIconKey(item.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of CURATED_ICONS) {
      expect(hasCuratedCategoryIcon(entry.name)).toBe(true);
    }
  });

  it("exposes deduplicated expanded curated account icons and emoji resolution", () => {
    expect(ACCOUNT_ICONS.length).toBeGreaterThanOrEqual(48);
    const keys = ACCOUNT_ICONS.map((item) => normalizeMaterialIconKey(item.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ACCOUNT_ICONS) {
      expect(hasCuratedAccountIcon(entry.name)).toBe(true);
    }
    expect(resolveAccountIconName("🚀")).toBe("AutoAwesome");
    expect(resolveAccountIconName("Piano")).toBe("Piano");
    expect(hasCuratedAccountIcon("Piano")).toBe(false);
  });

  it("routes non-curated Material icons through LazyMaterialIcon cleanly", () => {
    const categoryEl = renderMuiIcon("Bathtub", "small");
    expect(categoryEl.type).toBe(LazyMaterialIcon);

    const accountEl = AccountIcon({ icon: "Piano", fontSize: "medium" });
    expect(React.isValidElement(accountEl)).toBe(true);
    if (React.isValidElement(accountEl)) {
      expect(accountEl.type).toBe(LazyMaterialIcon);
    }
  });
});
