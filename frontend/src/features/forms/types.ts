export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "dropdown"
  | "multiselect"
  | "checkbox";

export interface FieldDef {
  id: number;
  category_id: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[] | null;
  unit?: string | null;
  hint?: string | null;
  sort_order: number;
  show_in_list: boolean;
  archived: boolean;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  track_expiry: boolean;
  expiry_label?: string | null;
  sort_order: number;
  items_count?: number;
  created_at: string;
  updated_at: string;
  fields?: FieldDef[];
}
