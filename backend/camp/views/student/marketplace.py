# camp/views/marketplace.py

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ...models import CosmeticItem, StudentCosmetic
from ...utils.marketplace import owns_item, purchase_item, equip_item


def student_for(request):
    return request.user.student


def _serialize_badges(student_badges):
    return [{"name": sb.badge.name, "icon": sb.badge.icon, "rarity": sb.badge.rarity} for sb in student_badges]


class MarketplaceListView(APIView):
    """
    Returns every active cosmetic with a computed status per student:
    'equipped' | 'owned' | 'locked'. One call, frontend just renders.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student = student_for(request)
        owned_ids = set(
            StudentCosmetic.objects.filter(student=student).values_list("item_id", flat=True)
        )
        equipped_ids = {
            student.equipped_avatar_id,
            student.equipped_theme_id,
            student.equipped_victory_effect_id,
        }

        items = CosmeticItem.objects.filter(is_active=True)
        data = []
        for item in items:
            is_owned = item.price == 0 or item.id in owned_ids
            status = "equipped" if item.id in equipped_ids else ("owned" if is_owned else "locked")
            data.append({
                "id": item.id,
                "category": item.category,
                "key": item.key,
                "name": item.name,
                "price": item.price,
                "status": status,
            })

        return Response({
            "coins": student.coins,
            "items": data,
        })


class MarketplacePurchaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        student = student_for(request)
        item, error = purchase_item(student, pk)
        if error:
            return Response({"detail": error}, status=400)
        return Response({
            "detail": f"{item.name} purchased!",
            "item_id": item.id,
            "category": item.category,
            "coins": student.coins,
        })


class MarketplaceEquipView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        student = student_for(request)
        item, error = equip_item(student, pk)
        if error:
            return Response({"detail": error}, status=400)
        return Response({
            "detail": f"{item.name} equipped!",
            "item_id": item.id,
            "category": item.category,
            "key": item.key,
        })


class ProfileView(APIView):
    """
    The student's personal hub: identity, progress, cosmetics.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        s = student_for(request)
        return Response({
            "username": s.full_name,
            "xp": s.xp,
            "coins": s.coins,
            "avatar": (
                {"key": s.equipped_avatar.key, "name": s.equipped_avatar.name}
                if s.equipped_avatar else None
            ),
            "theme": s.equipped_theme.key if s.equipped_theme else "default_light",
            "victory_effect": (
                {"key": s.equipped_victory_effect.key, "name": s.equipped_victory_effect.name}
                if s.equipped_victory_effect else None
            ),
            "badges": _serialize_badges(s.badges.select_related("badge").all()),
        })