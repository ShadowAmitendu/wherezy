import { z, ZodTypeAny } from "zod";
import { FieldDef } from "./types";

export function buildZodSchema(fields: FieldDef[]): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const field of fields) {
    if (field.archived) continue;

    let fieldValidator: ZodTypeAny;

    switch (field.type) {
      case "text":
      case "longtext":
        if (field.required) {
          fieldValidator = z.string().trim().min(1, `${field.label} is required`);
        } else {
          fieldValidator = z.string().optional().default("");
        }
        break;

      case "number":
        if (field.required) {
          fieldValidator = z.coerce.number();
        } else {
          fieldValidator = z
            .union([z.coerce.number(), z.literal(""), z.null()])
            .optional()
            .transform((val) => (val === "" || val === null ? undefined : val));
        }
        break;

      case "checkbox":
        fieldValidator = z.boolean().default(false);
        break;

      case "date":
        if (field.required) {
          fieldValidator = z.string().trim().min(1, `${field.label} is required`);
        } else {
          fieldValidator = z.string().optional().default("");
        }
        break;

      case "dropdown":
        if (field.required) {
          fieldValidator = z.string().trim().min(1, `${field.label} is required`);
        } else {
          fieldValidator = z.string().optional().default("");
        }
        break;

      case "multiselect":
        if (field.required) {
          fieldValidator = z
            .array(z.string())
            .min(1, `At least one option for ${field.label} is required`);
        } else {
          fieldValidator = z.array(z.string()).default([]);
        }
        break;

      default:
        fieldValidator = z.any().optional();
    }

    shape[field.key] = fieldValidator;
  }

  return z.object(shape);
}
