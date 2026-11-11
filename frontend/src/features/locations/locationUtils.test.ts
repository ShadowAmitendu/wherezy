import { describe, expect, it } from "vitest";
import {
  flattenLocationTree,
  isRoomKind,
  ROOM_GROUP_KINDS,
  STORAGE_AREA_KINDS,
} from "./locationUtils";

describe("locationUtils room grouping helpers", () => {
  it("distinguishes room-tier places from shelves and storage areas", () => {
    for (const roomKind of ROOM_GROUP_KINDS) {
      expect(isRoomKind(roomKind)).toBe(true);
    }
    expect(isRoomKind("storage room")).toBe(true);

    for (const subKind of STORAGE_AREA_KINDS) {
      expect(isRoomKind(subKind)).toBe(false);
    }
    expect(isRoomKind(null)).toBe(false);
  });

  it("flattens rooms, shelves, storage areas, and supports roomsOnly / excludeId filtering", () => {
    const sampleTree = [
      {
        id: 1,
        name: "Garage",
        kind: "Garage",
        path: "Garage",
        is_room: true,
        storage_only: false,
        children_count: 2,
        items_count: 0,
        total_items_count: 5,
        children: [
          {
            id: 2,
            name: "Camping Storage Area",
            kind: "Storage Area",
            path: "Garage > Camping Storage Area",
            is_room: false,
            storage_only: false,
            children_count: 0,
            items_count: 3,
            total_items_count: 3,
            children: [],
          },
          {
            id: 3,
            name: "Tool Shelf",
            kind: "Shelf",
            path: "Garage > Tool Shelf",
            is_room: false,
            storage_only: false,
            children_count: 0,
            items_count: 2,
            total_items_count: 2,
            children: [],
          },
        ],
      },
      {
        id: 4,
        name: "Store Room",
        kind: "Storage Room",
        path: "Store Room",
        is_room: true,
        storage_only: true,
        children_count: 0,
        items_count: 4,
        total_items_count: 4,
        children: [],
      },
    ];

    const all = flattenLocationTree(sampleTree);
    expect(all.map((o) => o.name)).toEqual([
      "Garage",
      "Camping Storage Area",
      "Tool Shelf",
      "Store Room",
    ]);
    expect(all[0].isRoom).toBe(true);
    expect(all[0].totalItemsCount).toBe(5);
    expect(all[1].depth).toBe(1);
    expect(all[3].storageOnly).toBe(true);

    const roomsOnly = flattenLocationTree(sampleTree, 0, null, { roomsOnly: true });
    expect(roomsOnly.map((o) => o.name)).toEqual(["Garage", "Store Room"]);

    const withoutGarage = flattenLocationTree(sampleTree, 0, 1);
    expect(withoutGarage.map((o) => o.name)).toEqual(["Store Room"]);
  });
});
