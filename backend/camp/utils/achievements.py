from camp.models import (
    Badge,
    Challenge,
    Lesson,
    Assignment,
    Submission,
    PuzzleCompletion, 
)
from .badges import award_badge


# The question types that count as a "puzzle game" for badge purposes,
# i.e. everything except the plain quiz types (multiple_choice, true_false,
# fill_blank). Shared with challenge.py so both stay in sync.
PUZZLE_TYPES = {
    "drag_order", "match_pairs", "memory_tiles",
    "word_search", "image_reveal", "prompt_build",
}


def _awarded(*results):
    """Filter award_badge() results down to the badges that were actually new."""
    return [b for b in results if b is not None]


def check_login(student):
    return _awarded(award_badge(student, "First Steps"))


def check_xp(student):
    xp = student.xp
    results = []

    if xp >= 100:
        results.append(award_badge(student, "XP Hunter"))
    if xp >= 500:
        results.append(award_badge(student, "Rising Star"))
    if xp >= 1000:
        results.append(award_badge(student, "AI Explorer"))
    if xp >= 2000:
        results.append(award_badge(student, "Future Innovator"))

    return _awarded(*results)


def check_submission(student):
    submissions = student.submissions.count()

    if submissions >= 1:
        return _awarded(award_badge(student, "First Submission"))
    return []


def _distinct_attended_lesson_count(student):
    return student.attendances.values("lesson").distinct().count()


def check_attendance(student):
    results = []
    attendance_count = student.attendances.count()

    if attendance_count >= 1:
        results.append(award_badge(student, "Present & Ready"))

    total_lessons = Lesson.objects.all().count()
    attended_lessons = _distinct_attended_lesson_count(student)

    if total_lessons and attended_lessons >= total_lessons:
        results.append(award_badge(student, "Attendance Hero"))
        results.append(award_badge(student, "Consistency"))

    return _awarded(*results)


def check_challenge(student, attempt=None):
    results = []
    attempts = student.challenge_attempts.count()

    if attempts >= 1:
        results.append(award_badge(student, "Challenge Accepted"))

    if attempts >= 5:
        results.append(award_badge(student, "Challenge Conqueror"))
        results.append(award_badge(student, "Boss Slayer"))

    if attempt:
        if attempt.accuracy == 100:
            results.append(award_badge(student, "Perfect Score"))

        if attempt.time_taken <= attempt.challenge.time_limit // 2:
            results.append(award_badge(student, "Speed Runner"))

    # Aggregate checks — don't depend on the specific attempt, so they also
    # run correctly during backfill (attempt=None).
    if (
        student.challenge_attempts.filter(completed_at__isnull=False).count()
        >= Challenge.objects.filter().count()
    ):
        results.append(award_badge(student, "Challenge Champion"))

    perfect_scores = student.challenge_attempts.filter(accuracy=100).count()
    if perfect_scores >= 3:
        results.append(award_badge(student, "Ultimate Challenger"))

    return _awarded(*results)


def check_puzzle(student):
    # Awarded the first time any puzzle game of any type is completed.
    return _awarded(award_badge(student, "Puzzle Solver"))


def check_prompt_apprentice(student):
    """
    Award after the student completes their first Prompt Builder puzzle.
    Call this alongside check_puzzle() whenever a puzzle of type
    'prompt_build' is completed (see score_fraction's qtype handling
    in challenge.py for the type name).
    """
    completed_prompt_build = PuzzleCompletion.objects.filter(
        student=student, puzzle_type="prompt_build"
    ).exists()

    if completed_prompt_build:
        return _awarded(award_badge(student, "Prompt Apprentice"))
    return []


def check_puzzle_master(student):
    """
    Award after the student has completed every puzzle type at least once.
    """
    completed_types = set(
        PuzzleCompletion.objects.filter(student=student)
        .values_list("puzzle_type", flat=True)
        .distinct()
    )

    if completed_types >= PUZZLE_TYPES:
        return _awarded(award_badge(student, "Puzzle Master"))
    return []


def check_learning(student):
    completed_lessons = _distinct_attended_lesson_count(student)

    if completed_lessons >= 1:
        return _awarded(award_badge(student, "Learning Begins"))
    return []


def check_coding_cadet(student):
    """
    Award after the student completes every assignment in any
    single mission.
    """
    submitted_assignment_ids = set(
        Submission.objects.filter(student=student).values_list(
            "assignment_id", flat=True
        )
    )

    mission_ids = (
        Assignment.objects.filter(lesson__mission__is_published=True)
        .values_list("lesson__mission_id", flat=True)
        .distinct()
    )

    for mission_id in mission_ids:
        mission_assignment_ids = set(
            Assignment.objects.filter(
                lesson__mission_id=mission_id
            ).values_list("id", flat=True)
        )

        if mission_assignment_ids and mission_assignment_ids <= submitted_assignment_ids:
            return _awarded(award_badge(student, "Coding Cadet"))

    return []


def check_ai_master(student):
    """
    Award after every lesson has been attended and every
    assignment has been submitted.
    """
    total_lessons = Lesson.objects.all().count()
    attended_lessons = _distinct_attended_lesson_count(student)

    total_assignments = Assignment.objects.all().count()
    submitted_assignments = (
        Submission.objects.filter(
            student=student
        )
        .values("assignment")
        .distinct()
        .count()
    )

    lessons_done = total_lessons > 0 and attended_lessons >= total_lessons
    assignments_done = total_assignments > 0 and submitted_assignments >= total_assignments

    if lessons_done and assignments_done:
        return _awarded(award_badge(student, "AI Master"))
    return []


def check_class_explorer(student):
    """
    Award after the student has visited every lesson page at least
    once. Requires a page-visit tracking model, since attendance
    alone only reflects live sessions.

    NOTE: no lesson-visit tracking model was provided in the given
    code — wire this up to whatever model records lesson page views,
    and call it from the lesson detail view after recording a visit.
    """
    try:
        from camp.models import LessonVisit
    except ImportError:
        return []

    total_lessons = Lesson.objects.filter(mission__is_published=True).count()
    visited_lessons = (
        LessonVisit.objects.filter(student=student).values("lesson").distinct().count()
    )

    if total_lessons and visited_lessons >= total_lessons:
        return _awarded(award_badge(student, "Class Explorer"))
    return []


def check_hall_of_fame(student, leaderboard_first_student):
    if leaderboard_first_student == student:
        return _awarded(award_badge(student, "Hall of Fame"))
    return []


def check_legend(student):
    """
    Award after collecting every non-legendary badge.
    """
    owned = student.badges.count()
    total_required = Badge.objects.exclude(rarity="legendary").count()

    if owned >= total_required:
        return _awarded(award_badge(student, "Legend"))
    return []