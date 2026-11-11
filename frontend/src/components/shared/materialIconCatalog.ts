export type MaterialIconElementTuple = [
  string,
  Record<string, string | number>,
];

export type MaterialIconShape = string | MaterialIconElementTuple[];

export interface MaterialIconEntry {
  /** Exact PascalCase export name in @mui/icons-material (e.g., "RocketLaunch"). */
  name: string;
  /** Human-friendly display label (e.g., "Rocket Launch"). */
  label: string;
  /** Pre-normalized alphanumeric lowercase lookup key (e.g., "rocketlaunch"). */
  key: string;
  /** Compact SVG path string or primitive element tuples on a 24x24 viewBox. */
  shape: MaterialIconShape;
  /** Lowercased label for fast substring search. */
  labelLower: string;
}

interface CatalogStore {
  loaded: boolean;
  entries: MaterialIconEntry[];
  byKey: Map<string, MaterialIconEntry>;
}

const emptyStore: CatalogStore = {
  loaded: false,
  entries: [],
  byKey: new Map(),
};

let currentStore: CatalogStore = emptyStore;
let loadPromise: Promise<MaterialIconEntry[]> | null = null;
const listeners = new Set<() => void>();

/** Normalize any Material icon identifier (PascalCase, snake_case, kebab-case) to a compact lookup key. */
export function normalizeMaterialIconKey(iconName: string): string {
  return iconName.trim().replace(/[\s_-]+/g, "").toLowerCase();
}

/** Convert a PascalCase @mui/icons-material name into a readable spaced label. */
export function formatMaterialIconLabel(pascalName: string): string {
  return pascalName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .trim();
}

function buildCatalog(raw: Record<string, MaterialIconShape>): CatalogStore {
  const entries: MaterialIconEntry[] = [];
  const byKey = new Map<string, MaterialIconEntry>();

  for (const [name, shape] of Object.entries(raw)) {
    const label = formatMaterialIconLabel(name);
    const key = normalizeMaterialIconKey(name);
    const entry: MaterialIconEntry = {
      name,
      label,
      key,
      shape,
      labelLower: label.toLowerCase(),
    };
    entries.push(entry);
    byKey.set(key, entry);
  }

  return { loaded: true, entries, byKey };
}

/** Lazily load and index all 2,100+ offline Material Icons once per session. */
export function loadMaterialIconCatalog(): Promise<MaterialIconEntry[]> {
  if (currentStore.loaded) {
    return Promise.resolve(currentStore.entries);
  }
  if (!loadPromise) {
    loadPromise = import("./materialIconData.json")
      .then((mod) => {
        const raw = (mod.default ?? mod) as unknown as Record<
          string,
          MaterialIconShape
        >;
        currentStore = buildCatalog(raw);
        for (const listener of listeners) {
          listener();
        }
        return currentStore.entries;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function subscribeMaterialIconCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMaterialIconCatalogSnapshot(): CatalogStore {
  return currentStore;
}

export function getAllMaterialIconEntries(): MaterialIconEntry[] {
  return currentStore.entries;
}

export function getCachedMaterialIconEntry(
  iconName?: string | null,
): MaterialIconEntry | null {
  if (!iconName || !currentStore.loaded) return null;
  return currentStore.byKey.get(normalizeMaterialIconKey(iconName)) ?? null;
}

/** Rank and filter Material Icons by query tokens across label and identifier. */
export function searchMaterialIcons(
  query: string,
  limit = 120,
): MaterialIconEntry[] {
  if (!currentStore.loaded) return [];
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return currentStore.entries.slice(0, limit);
  }

  const normalizedQuery = normalizeMaterialIconKey(trimmed);
  const tokens = trimmed.split(/[\s_-]+/).filter(Boolean);
  const ranked: Array<{ score: number; entry: MaterialIconEntry }> = [];

  for (const entry of currentStore.entries) {
    const matchesAll = tokens.every(
      (token) => entry.labelLower.includes(token) || entry.key.includes(token),
    );
    if (!matchesAll) continue;

    let score = 3;
    if (entry.key === normalizedQuery) {
      score = 0;
    } else if (
      entry.labelLower.startsWith(trimmed) ||
      entry.key.startsWith(normalizedQuery)
    ) {
      score = 1;
    } else if (entry.labelLower.split(" ").some((word) => word.startsWith(trimmed))) {
      score = 2;
    }

    ranked.push({ score, entry });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.name.localeCompare(b.entry.name);
  });

  return ranked.slice(0, limit).map((item) => item.entry);
}
