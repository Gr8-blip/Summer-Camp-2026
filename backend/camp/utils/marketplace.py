# camp/utils/marketplace.py
#
# Coin-safe purchase + equip logic. Mirrors the F()-expression-then-refresh
# pattern already used in utils/coins.py and the Challenge/Quest submit
# views, so it stays consistent with the rest of the codebase.

from django.db import transaction
from django.db.models import F
from ..models import CosmeticItem, StudentCosmetic


def owns_item(student, item):
    """Free items are owned by everyone by default. Paid items need a
    StudentCosmetic row."""
    if item.price == 0:
        return True
    return StudentCosmetic.objects.filter(student=student, item=item).exists()


@transaction.atomic
def purchase_item(student, item_id):
    """
    Returns (item, error_message). error_message is None on success.
    select_for_update on the item + refresh_from_db on the student's coins
    guards against double-spend from rapid double-clicks/parallel requests.
    """
    item = CosmeticItem.objects.select_for_update().filter(pk=item_id, is_active=True).first()
    if not item:
        return None, "Item not found."

    if owns_item(student, item):
        return None, "You already own this item."

    student.refresh_from_db(fields=["coins"])
    if student.coins < item.price:
        return None, "Not enough coins."

    StudentCosmetic.objects.get_or_create(student=student, item=item)
    student.coins = F("coins") - item.price
    student.save(update_fields=["coins"])
    student.refresh_from_db(fields=["coins"])

    return item, None


def equip_item(student, item_id):
    """
    Returns (item, error_message). Equipping just sets the relevant FK on
    Student — one slot per category (avatar / theme / victory_effect).
    """
    item = CosmeticItem.objects.filter(pk=item_id, is_active=True).first()
    if not item:
        return None, "Item not found."

    if not owns_item(student, item):
        return None, "You don't own this item yet — purchase it first."

    field_map = {
        "avatar": "equipped_avatar",
        "theme": "equipped_theme",
        "victory_effect": "equipped_victory_effect",
    }
    field = field_map[item.category]
    setattr(student, field, item)
    student.save(update_fields=[field])

    return item, None