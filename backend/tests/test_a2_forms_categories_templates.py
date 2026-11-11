def test_category_crud_and_fields(client):
    # 1. Create Category
    res = client.post("/api/categories", json={
        "name": "Electronics Test",
        "icon": "devices",
        "color": "#3f51b5",
        "track_expiry": False
    })
    assert res.status_code == 200
    cat = res.json()
    cat_id = cat["id"]

    # 2. Add Field
    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Serial Number",
        "type": "text",
        "required": True,
        "show_in_list": True
    })
    assert res.status_code == 200
    field = res.json()
    field_id = field["id"]
    assert field["key"].startswith("f_")

    # 3. Add Dropdown Field
    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Condition",
        "type": "dropdown",
        "required": False,
        "options": ["New", "Used", "Refurbished"],
        "show_in_list": True
    })
    assert res.status_code == 200

    # 4. Incompatible type change should fail (e.g. number to date)
    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Voltage",
        "type": "number",
        "unit": "V"
    })
    assert res.status_code == 200
    volt_field_id = res.json()["id"]

    res = client.put(f"/api/fields/{volt_field_id}", json={"type": "date"})
    assert res.status_code == 400
    assert "INCOMPATIBLE_TYPE_CHANGE" in res.text

    # 5. Archive field
    res = client.delete(f"/api/fields/{volt_field_id}")
    assert res.status_code == 200

    # 6. Reorder fields
    res = client.post(f"/api/categories/{cat_id}/fields/reorder", json={"field_ids": [field_id]})
    assert res.status_code == 200

    # 7. Apply all registered templates (including new household presets)
    tpl_res = client.get("/api/templates")
    assert tpl_res.status_code == 200
    all_tpls = tpl_res.json()
    assert len(all_tpls) >= 21  # 20 household templates + blank
    for tpl in all_tpls:
        slug = tpl["slug"]
        res = client.post(f"/api/templates/{slug}/apply")
        assert res.status_code == 200, f"Failed applying template {slug}: {res.text}"
        if slug != "blank":
            assert len(res.json()["fields"]) == tpl["field_count"] > 0
