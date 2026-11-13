import pytest


def test_custom_templates_lifecycle_and_type_customization(client):
    # 1. Inspect built-in template detail with fields
    res = client.get("/api/templates/medicines")
    assert res.status_code == 200
    med_tpl = res.json()
    assert med_tpl["name"] == "Medicines"
    assert med_tpl["is_custom"] is False
    assert len(med_tpl["fields"]) > 0
    # Confirm field types exist in detail
    assert any(f["type"] == "dropdown" for f in med_tpl["fields"])
    assert any(f["type"] == "text" for f in med_tpl["fields"])

    # 2. Apply a template WITH customized field types on the fly
    customized_fields = [
        {"label": "Medication Code", "type": "text", "required": True, "show_in_list": True},
        # Changed Dosage from number or text to dropdown!
        {
            "label": "Dosage Unit",
            "type": "dropdown",
            "required": True,
            "options": ["500mg", "250mg", "100mg", "10ml"],
            "show_in_list": True,
        },
        # Added new field with checkbox boolean type
        {"label": "Requires Prescription", "type": "checkbox", "required": False, "show_in_list": True},
        # Added numeric field with unit
        {"label": "Strip Count", "type": "number", "unit": "strips", "required": False, "show_in_list": False},
    ]

    apply_res = client.post(
        "/api/templates/medicines/apply",
        json={
            "name": "Customized Clinic Meds",
            "icon": "local_hospital",
            "color": "#00897b",
            "track_expiry": True,
            "expiry_label": "Valid Till",
            "fields": customized_fields,
        },
    )
    assert apply_res.status_code == 200
    created_cat = apply_res.json()
    assert created_cat["name"] == "Customized Clinic Meds"
    assert created_cat["icon"] == "local_hospital"
    assert created_cat["color"] == "#00897b"
    assert created_cat["expiry_label"] == "Valid Till"
    assert len(created_cat["fields"]) == 4

    # Verify field types were customized correctly in the DB
    cat_fields = created_cat["fields"]
    dosage_field = next(f for f in cat_fields if f["label"] == "Dosage Unit")
    assert dosage_field["type"] == "dropdown"
    assert "500mg" in (dosage_field["options"] or [])

    rx_field = next(f for f in cat_fields if f["label"] == "Requires Prescription")
    assert rx_field["type"] == "checkbox"

    strip_field = next(f for f in cat_fields if f["label"] == "Strip Count")
    assert strip_field["type"] == "number"
    assert strip_field["unit"] == "strips"

    # 3. Create a brand new Custom Template
    create_tpl_res = client.post(
        "/api/templates",
        json={
            "name": "Vintage Watches",
            "icon": "watch",
            "color": "#ed6c02",
            "description": "Collector watch specifications",
            "track_expiry": False,
            "fields": [
                {"label": "Movement", "type": "dropdown", "options": ["Automatic", "Manual", "Quartz"], "required": True},
                {"label": "Case Size", "type": "number", "unit": "mm", "required": True},
                {"label": "Serial Number", "type": "text", "required": True},
                {"label": "Service History", "type": "longtext", "required": False},
            ],
        },
    )
    assert create_tpl_res.status_code == 200
    watch_tpl = create_tpl_res.json()
    assert watch_tpl["name"] == "Vintage Watches"
    assert watch_tpl["is_custom"] is True
    assert watch_tpl["slug"] == "vintage_watches"
    assert len(watch_tpl["fields"]) == 4

    # 4. List templates should include custom template with is_custom=True
    list_res = client.get("/api/templates")
    assert list_res.status_code == 200
    summaries = list_res.json()
    found_watch = next((s for s in summaries if s["slug"] == "vintage_watches"), None)
    assert found_watch is not None
    assert found_watch["is_custom"] is True
    assert found_watch["field_count"] == 4

    # 5. Update custom template (change types, add options, rename)
    update_res = client.put(
        "/api/templates/vintage_watches",
        json={
            "name": "Luxury Timepieces",
            "fields": [
                # Change Movement to multiselect or text
                {"label": "Movement Type", "type": "text", "required": True},
                # Add waterproof checkbox
                {"label": "Water Resistant", "type": "checkbox", "required": False},
                {"label": "Lug Width", "type": "number", "unit": "mm", "required": False},
            ],
        },
    )
    assert update_res.status_code == 200
    updated_watch = update_res.json()
    assert updated_watch["name"] == "Luxury Timepieces"
    assert len(updated_watch["fields"]) == 3
    assert updated_watch["fields"][1]["type"] == "checkbox"

    # 6. Apply the user's custom template to create a category
    apply_custom_res = client.post("/api/templates/vintage_watches/apply")
    assert apply_custom_res.status_code == 200
    watch_cat = apply_custom_res.json()
    assert watch_cat["name"] == "Luxury Timepieces"
    assert len(watch_cat["fields"]) == 3

    # 7. Save an existing category as a new reusable template
    save_as_tpl_res = client.post(f"/api/templates/from-category/{watch_cat['id']}")
    assert save_as_tpl_res.status_code == 200
    saved_tpl = save_as_tpl_res.json()
    assert "Luxury Timepieces" in saved_tpl["name"]
    assert saved_tpl["is_custom"] is True
    assert len(saved_tpl["fields"]) == 3

    # 8. Built-in template immutability check
    mut_res = client.put("/api/templates/tools", json={"name": "Hacked Tools"})
    assert mut_res.status_code == 400
    del_builtin_res = client.delete("/api/templates/tools")
    assert del_builtin_res.status_code == 400

    # 9. Delete custom template
    del_res = client.delete("/api/templates/vintage_watches")
    assert del_res.status_code == 200
    get_deleted = client.get("/api/templates/vintage_watches")
    assert get_deleted.status_code == 404
