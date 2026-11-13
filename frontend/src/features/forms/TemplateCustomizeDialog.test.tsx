import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TemplateCustomizeDialog,
  FIELD_TYPES,
  type EditableTemplateField,
} from "./TemplateCustomizeDialog";

vi.mock("../../api/client", () => ({
  api: {
    getTemplate: vi.fn().mockResolvedValue({
      name: "Smart Home",
      slug: "smart_home",
      icon: "router",
      color: "#0284c7",
      track_expiry: false,
      fields: [
        {
          name: "Protocol",
          field_type: "dropdown",
          required: true,
          show_in_list: true,
          options_json: ["Zigbee", "Matter", "Z-Wave"],
        },
        {
          name: "IP Address",
          field_type: "text",
          required: false,
          show_in_list: false,
        },
      ],
    }),
    applyTemplate: vi.fn(),
    createCustomTemplate: vi.fn(),
    updateCustomTemplate: vi.fn(),
    deleteCustomTemplate: vi.fn(),
    saveCategoryAsTemplate: vi.fn(),
  },
  ApiException: class ApiException extends Error {
    error: any;
    constructor(error: any) {
      super(error.message);
      this.error = error;
    }
  },
}));

vi.mock("../../components/shared/IconPicker", () => ({
  IconPicker: () => <div data-testid="icon-picker" />,
}));

vi.mock("../../components/shared/ColorSwatchPicker", () => ({
  ColorSwatchPicker: () => <div data-testid="color-picker" />,
}));

describe("TemplateCustomizeDialog & FIELD_TYPES", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports all required supported field types with descriptive labels and hints", () => {
    const typeValues = FIELD_TYPES.map((f) => f.value);
    expect(typeValues).toContain("text");
    expect(typeValues).toContain("longtext");
    expect(typeValues).toContain("number");
    expect(typeValues).toContain("date");
    expect(typeValues).toContain("dropdown");
    expect(typeValues).toContain("multiselect");
    expect(typeValues).toContain("checkbox");

    const dropdown = FIELD_TYPES.find((f) => f.value === "dropdown");
    expect(dropdown?.label).toBe("Dropdown (Single Select)");

    const checkbox = FIELD_TYPES.find((f) => f.value === "checkbox");
    expect(checkbox?.label).toBe("Checkbox (Yes/No)");

    const numberType = FIELD_TYPES.find((f) => f.value === "number");
    expect(numberType?.label).toBe("Number");
  });

  it("renders customize_apply dialog layout cleanly with action buttons", () => {
    const html = renderToStaticMarkup(
      <TemplateCustomizeDialog
        open={true}
        disablePortal
        mode="customize_apply"
        templateSlug="smart_home"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(html).toContain("Customize &amp; Use Template");
    expect(html).toContain("Create Category");
    expect(html).toContain("Save as Reusable Template");
    expect(html).toContain("Cancel");
  });

  it("renders create_custom dialog layout with custom template fields", () => {
    const html = renderToStaticMarkup(
      <TemplateCustomizeDialog
        open={true}
        disablePortal
        mode="create_custom"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(html).toContain("Create Custom Template");
    expect(html).toContain("Template / Category Name");
    expect(html).toContain("Description (Optional)");
    expect(html).toContain("Create Template");
    expect(html).toContain("Add Field");
  });

  it("renders edit_custom dialog layout with save action", () => {
    const html = renderToStaticMarkup(
      <TemplateCustomizeDialog
        open={true}
        disablePortal
        mode="edit_custom"
        templateSlug="my_custom_tpl"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(html).toContain("Edit Custom Template");
    expect(html).toContain("Save Changes");
  });
});
