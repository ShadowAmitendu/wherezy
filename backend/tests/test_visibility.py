from backend.app.services.visibility import items_visible
from backend.app.models import Item, Category

def test_items_visibility_service(db_session):
    cat = Category(name="VisibilityCat", icon="cat", color="#123456")
    db_session.add(cat)
    db_session.commit()

    active_item = Item(name="ActiveItem", category_id=cat.id, status="active", deleted_at=None)
    inbox_item = Item(name="InboxItem", category_id=cat.id, status="inbox", deleted_at=None)
    retired_item = Item(name="RetiredItem", category_id=cat.id, status="retired", deleted_at=None)
    trashed_item = Item(name="TrashedItem", category_id=cat.id, status="active", deleted_at="2026-11-10T12:00:00Z")

    db_session.add_all([active_item, inbox_item, retired_item, trashed_item])
    db_session.commit()

    visible = items_visible(db_session).all()
    visible_names = {it.name for it in visible}

    assert "ActiveItem" in visible_names
    assert "InboxItem" not in visible_names
    assert "RetiredItem" not in visible_names
    assert "TrashedItem" not in visible_names
