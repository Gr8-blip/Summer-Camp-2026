from django.db import transaction
from django.utils import timezone

from ..models import Challenge, ChallengeAttempt, ChallengeWin
from . import achievements


def challenge_is_finalized(challenge: Challenge) -> bool:
    """
    A challenge is only over once its deadline has passed. We deliberately
    do NOT treat "everyone who has started so far is done" as finalized —
    a student who hasn't clicked Start yet could still show up and beat
    everyone, so finalizing early would crown a false champion.
    """
    return timezone.now() >= challenge.end_date


def _rank_key(attempt: ChallengeAttempt):
    # Higher score wins -> negate for ascending sort.
    # Faster time wins -> ascending.
    # Earlier submission wins -> ascending completed_at.
    return (-attempt.score, attempt.time_taken, attempt.completed_at)


def get_ranked_attempts(challenge: Challenge):
    """Live-safe: works whether the challenge is finalized or not."""
    attempts = list(
        ChallengeAttempt.objects
        .filter(challenge=challenge, completed_at__isnull=False)
        .select_related("student")
    )
    attempts.sort(key=_rank_key)
    return attempts


@transaction.atomic
def finalize_challenge_if_ready(challenge: Challenge):
    """
    Idempotent. Call this opportunistically (after a submit, or when the
    leaderboard is viewed). If the challenge is finalized and doesn't
    already have a champion, crown the top-ranked attempt using the
    score -> time_taken -> completed_at tie-break and award Hall of Fame.

    select_for_update + get_or_create on the OneToOne means two
    concurrent requests racing to finalize the same challenge can't both
    create a ChallengeWin — the second one just finds the first one's
    row already there and does nothing.
    """
    if not challenge_is_finalized(challenge):
        return None, []

    challenge = Challenge.objects.select_for_update().get(pk=challenge.pk)

    existing = ChallengeWin.objects.filter(challenge=challenge).first()
    if existing:
        return existing, []

    ranked = get_ranked_attempts(challenge)
    if not ranked:
        return None, []  # nobody finished it — no champion

    winner_attempt = ranked[0]
    win, created = ChallengeWin.objects.get_or_create(
        challenge=challenge,
        defaults={
            "student": winner_attempt.student,
            "score": winner_attempt.score,
            "time_taken": winner_attempt.time_taken,
        },
    )

    new_badges = []
    if created:
        new_badges += achievements.check_hall_of_fame(win.student, win.student)
        new_badges += achievements.check_legend(win.student)

    return win, new_badges