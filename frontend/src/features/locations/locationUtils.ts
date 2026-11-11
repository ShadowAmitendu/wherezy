export const ROOM_GROUP_KINDS = [
  "Room",
  "Storage Room",
  "Garage",
  "Shed",
  "Attic",
  "Basement",
] as const;

export const STORAGE_AREA_KINDS = [
  "Storage Area",
  "Shelf",
  "Cupboard",
  "Closet",
  "Rack",
  "Drawer",
  "Box",
  "Bin",
  "Bag",
] as const;

export const SUGGESTED_LOCATION_KINDS = [
  ...ROOM_GROUP_KINDS,
  ...STORAGE_AREA_KINDS,
] as const;

const ROOM_KIND_SET = new Set(ROOM_GROUP_KINDS.map((k) => k.toLowerCase()));

export function isRoomKind(kind?: string | null): boolean {
  return ROOM_KIND_SET.has((kind || "").trim().toLowerCase());
}

export interface FlatLocationOption {
  id: number;
  name: string;
  kind: string;
  path: string;
  depth: number;
  isRoom: boolean;
  storageOnly: boolean;
  childrenCount: number;
  itemsCount: number;
  totalItemsCount: number;
  roomId?: number | null;
  roomName?: string | null;
}

export interface FlattenLocationOptions {
  roomsOnly?: boolean;
}

/** Flattens a nested location tree into an indented option list for pickers. */
export function flattenLocationTree(
  nodes: any[],
  depth = 0,
  excludeId?: number | null,
  options?: FlattenLocationOptions
): FlatLocationOption[] {
  let list: FlatLocationOption[] = [];
  const roomsOnly = Boolean(options?.roomsOnly);

  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    const nodeIsRoom = typeof node.is_room === "boolean" ? node.is_room : isRoomKind(node.kind);
    const children = Array.isArray(node.children) ? node.children : [];

    if (!roomsOnly || nodeIsRoom) {
      list.push({
        id: node.id,
        name: node.name,
        kind: node.kind,
        path: node.path || node.name,
        depth,
        isRoom: nodeIsRoom,
        storageOnly: Boolean(node.storage_only),
        childrenCount:
          typeof node.children_count === "number" ? node.children_count : children.length,
        itemsCount: typeof node.items_count === "number" ? node.items_count : 0,
        totalItemsCount:
          typeof node.total_items_count === "number"
            ? node.total_items_count
            : typeof node.items_count === "number"
              ? node.items_count
              : 0,
        roomId: node.room_id ?? null,
        roomName: node.room_name ?? null,
      });
    }

    if (children.length > 0) {
      list = list.concat(flattenLocationTree(children, depth + 1, excludeId, options));
    }
  }
  return list;
}
