from django.db.models import F
from ..models import CoinLog

# Hard ceiling per single game run, regardless of what the client claims
# it earned. The client computes the "real" number (speed, no mistakes,
# potions found, etc. — all things that live naturally in the game's own
# state), but the server never trusts it blindly since coins aren't
# spendable anywhere *yet* — this cap just keeps the ledger sane while
# that's being designed, not a serious anti-cheat measure.
MAX_COINS_PER_RUN = 100


def clamp_coins(raw):
    """Coerce whatever the client sent into a safe non-negative int."""
    try:
        amount = int(raw)
    except (TypeError, ValueError):
        return 0
    return max(0, min(MAX_COINS_PER_RUN, amount))


def award_coins(student, amount, reason):
    """Mirrors the inline XP-award pattern already used in
    ChallengeSubmitView / QuestSubmitView — same shape, same
    F()-expression-then-refresh dance, just for the coins ledger."""
    if amount <= 0:
        return
    CoinLog.objects.create(student=student, amount=amount, reason=reason)
    student.coins = F('coins') + amount
    student.save(update_fields=['coins'])
    student.refresh_from_db(fields=['coins'])