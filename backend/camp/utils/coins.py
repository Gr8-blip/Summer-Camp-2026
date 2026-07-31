from django.db.models import F
from ..models import CoinLog

# Hard ceiling per single game run, regardless of what the client claims
# it earned. Coins are computed server-side from challenge accuracy (see
# challenge.py:coins_for_score — 100% accuracy pays out up to 450), so
# this cap just has to sit at or above that top of that band; it's a
# sanity backstop, not the thing doing the real scoring.
MAX_COINS_PER_RUN = 450


def clamp_coins(raw):
    """Coerce whatever the client sent into a safe non-negative int."""
    try:
        amount = int(raw)
    except (TypeError, ValueError):
        return 0
    return max(0, min(MAX_COINS_PER_RUN, amount))


def award_coins(student, amount, reason):
    """
    Mirrors the inline XP-award pattern already used in ChallengeSubmitView
    / QuestSubmitView — same shape, same F()-expression-then-refresh dance,
    just for the coins ledger.

    Returns the amount actually awarded (0 if amount <= 0), so callers can
    build a `coin_events` list for the frontend without duplicating the
    "did this actually pay out" logic.
    """
    if amount <= 0:
        return 0
    CoinLog.objects.create(student=student, amount=amount, reason=reason)
    student.coins = F('coins') + amount
    student.save(update_fields=['coins'])
    student.refresh_from_db(fields=['coins'])
    return amount


def award_coins_once(student, amount, reason):
    """
    Same as award_coins, but guarded so a given (student, reason) pair
    can only ever pay out once. Used for one-time milestone bonuses
    (lesson completion, mission completion) where the exact reason
    string is the dedupe key — no new model/migration required, since
    CoinLog already exists and every award writes a row there.

    Returns the amount actually awarded this call — 0 if it had already
    been paid before (no-op), same convention as award_coins().
    """
    if CoinLog.objects.filter(student=student, reason=reason).exists():
        return 0
    return award_coins(student, amount, reason=reason)