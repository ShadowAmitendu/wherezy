export interface FlatLocationOption {
  id: number;
  name: string;
  kind: string;
  path: string;
  depth: number;
}

/** Flattens a nested location tree into an indented option list for pickers. */
export function flattenLocationTree(
  nodes: any[],
  depth = 0,
  excludeId?: number | null
): FlatLocationOption[] {
  let list: FlatLocationOption[] = [];
  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    list.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      path: node.path || node.name,
      depth,
    });
    if (node.children && node.children.length > 0) {
      list = list.concat(flattenLocationTree(node.children, depth + 1, excludeId));
    }
  }
  return list;
}
