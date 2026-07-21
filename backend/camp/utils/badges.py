from camp.models import Badge, StudentBadge
from .xp import award_xp


BADGE_XP = {
    "common": 20,
    "rare": 50,
    "epic": 100,
    "legendary": 250,
}


def award_badge(student, badge_name):
    """
    Awards a badge if the student doesn't already have it.
    Also grants the XP reward for the badge.

    Returns the Badge instance if it was newly awarded, otherwise None.
    This lets callers collect everything unlocked during a request and
    surface it in the API response as `new_badges`.
    """

    try:
        badge = Badge.objects.get(name=badge_name)
    except Badge.DoesNotExist:
        return None

    already_has_badge = StudentBadge.objects.filter(
        student=student,
        badge=badge
    ).exists()

    if already_has_badge:
        return None

    StudentBadge.objects.create(
        student=student,
        badge=badge,
    )

    award_xp(
        student,
        BADGE_XP[badge.rarity],
        f"Badge earned: {badge.name}"
    )

    return badge