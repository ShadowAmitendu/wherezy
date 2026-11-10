import { FieldDef } from "../forms/types";
import { Photo } from "../photos/PhotoManager";
import { BreadcrumbItem } from "../../components/shared/LocationBreadcrumb";

export interface Item {
  id: number;
  name: string;
  category_id: number;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  location_path?: string | null;
  taken_out: boolean;
  taken_by?: string | null;
  taken_at?: string | null;
  expiry_date?: string | null;
  expiry_status?: "expired" | "soon" | "ok" | "none" | null;
  notes?: string | null;
  values: Record<string, any>;
  cover_photo_id?: number | null;
  cover_thumb_url?: string | null;
  created_at: string;
  updated_at: string;
  breadcrumbs?: BreadcrumbItem[];
  photos?: Photo[];
  field_defs?: FieldDef[];
}
