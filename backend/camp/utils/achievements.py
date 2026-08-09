from camp.models import (
    Badge,
    Challenge,
    Lesson,
    Mission,
    Assignment,
    Submission,
    PuzzleCompletion, 
    AssignmentAttempt
)
from .badges import award_badge


# The question types that count as a "puzzle game" for badge purposes,
# i.e. everything except the plain quiz types (multiple_choice, true_false,
# fill_blank). Shared with challenge.py so both stay in sync.
PUZZLE_TYPES = {
    "drag_order", "match_pairs", "memory_tiles",
    "word_search", "image_reveal", "prompt_build",
    "interactive_coding",
}


def countable_lessons():
    """The set of lessons that actually count toward completion badges —
    Shared with badge.py so the awarding logic and the progress-bar
    logic can never disagree on the denominator."""
    return Lesson.objects.all()

def countable_assignments():
    """Same idea as countable_lessons(), for quests.

    Only filters on the Assignment's own is_published — a lesson's or
    mission's published state no longer gates badge counting, so every
    lesson/quest in the camp counts toward badges regardless of the
    lesson/mission publish flag."""
    return Assignment.objects.filter(is_published=True)


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

def _distinct_attended_lesson_count(student):
    return student.attendances.filter(lesson__in=countable_lessons()).values("lesson").distinct().count()


def _mission_challenges_complete(student, mission):
    """True when every Challenge belonging to this mission has a completed
    ChallengeAttempt from the student (vacuously true if the mission has
    no challenges)."""
    challenge_ids = set(Challenge.objects.filter(mission=mission).values_list("id", flat=True))
    if not challenge_ids:
        return True

    completed_challenge_ids = set(
        student.challenge_attempts.filter(
            completed_at__isnull=False, challenge_id__in=challenge_ids
        ).values_list("challenge_id", flat=True)
    )
    return challenge_ids <= completed_challenge_ids


def mission_quests_and_challenges_complete(student, mission):
    """
    True once every Quest belonging to the mission's lessons (see
    lesson_fully_complete) AND every Challenge belonging to the mission
    has been completed by the student. Unlike mission_fully_complete,
    this doesn't require lesson attendance — it's purely about finishing
    the quests/challenges, which is what Attendance Hero counts.
    """
    for lesson in Lesson.objects.filter(mission=mission):
        if not lesson_fully_complete(student, lesson):
            return False

    return _mission_challenges_complete(student, mission)


def check_attendance(student):
    results = []
    attendance_count = student.attendances.count()

    if attendance_count >= 1:
        results.append(award_badge(student, "Present & Ready"))

    total_lessons = countable_lessons().count()
    attended_lessons = _distinct_attended_lesson_count(student)

    if total_lessons and attended_lessons >= total_lessons:
        results.append(award_badge(student, "Consistency"))

    completed_missions = sum(
        1 for mission in Mission.objects.all()
        if mission_quests_and_challenges_complete(student, mission)
    )
    if completed_missions >= 2:
        results.append(award_badge(student, "Attendance Hero"))

    return _awarded(*results)


def check_challenge(student, attempt=None):
    results = []
    attempts = student.challenge_attempts.count()

    if attempts >= 1:
        results.append(award_badge(student, "Challenge Accepted"))

    if attempts >= 5:
        results.append(award_badge(student, "Challenge Conqueror"))

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


def check_quest_completion(student):
    """Award after the student completes their first quest (any assignment
    with a completed AssignmentAttempt)."""
    completed = student.assignment_attempts.filter(completed_at__isnull=False).count()

    if completed >= 1:
        return _awarded(award_badge(student, "Quest Complete"))
    return []


def check_flawless_victory(student, attempt):
    """
    Award once ever, the first time a student completes a Quest on their
    very first attempt (attempt.attempt_count == 1) with 100% accuracy.
    Call this from QuestSubmitView right after an attempt completes —
    attempt_count is only 1 on that very first successful submission
    (see quest.py), so it's safe to call this on every completion;
    award_badge() itself is idempotent per student either way.
    """
    if attempt.attempt_count == 1 and attempt.accuracy == 100:
        return _awarded(award_badge(student, "Flawless Victory"))
    return []


def lesson_fully_complete(student, lesson):
    """
    True once every published Quest (Assignment) belonging to this lesson
    has been completed by the student. Mirrors LessonSerializer's
    get_quests_completed logic (question-based assignments need a
    completed AssignmentAttempt; legacy classic assignments just need a
    Submission) so "complete" means the same thing everywhere.
    """
    assignments = lesson.assignments.filter(is_published=True)
    if not assignments.exists():
        return True

    for assignment in assignments:
        if assignment.questions.exists():
            done = AssignmentAttempt.objects.filter(
                assignment=assignment, student=student, completed_at__isnull=False
            ).exists()
        else:
            done = Submission.objects.filter(assignment=assignment, student=student).exists()
        if not done:
            return False

    return True


def mission_fully_complete(student, mission):
    """
    True once EVERY Lesson in the mission (published or not) has
    attendance recorded AND every Quest in every one of those lessons is
    complete (see lesson_fully_complete). This is the "100% mission
    completion" bar used by both the Mission Completionist badge and the
    Mission Completion coin bonus.
    """
    lessons = Lesson.objects.filter(mission=mission)
    if not lessons.exists():
        return False

    attended_ids = set(
        student.attendances.filter(lesson__in=lessons).values_list("lesson_id", flat=True)
    )
    if attended_ids < set(lessons.values_list("id", flat=True)):
        return False

    for lesson in lessons:
        if not lesson_fully_complete(student, lesson):
            return False

    return True


def check_mission_completionist(student, mission):
    """
    Award once ever (StudentBadge's unique constraint makes repeat calls
    across different missions a safe no-op after the first success), the
    first time mission_fully_complete() is true for any mission.
    """
    if mission_fully_complete(student, mission):
        return _awarded(award_badge(student, "Mission Completionist"))
    return []


def check_code_cracker(student):
    """
    Award once ever, the first time the student completes ANY quest that
    contains at least one interactive_coding question. Call this
    alongside check_coding_cadet() on every quest submit — it's a no-op
    once already earned since award_badge() is idempotent per student.
    """
    completed_assignment_ids = AssignmentAttempt.objects.filter(
        student=student, completed_at__isnull=False
    ).values_list("assignment_id", flat=True)

    has_coding_quest = Assignment.objects.filter(
        id__in=completed_assignment_ids,
        questions__question_type="interactive_coding",
    ).exists()

    if has_coding_quest:
        return _awarded(award_badge(student, "Code Cracker"))
    return []


def check_flawless_coder(student, attempt):
    """
    Award once ever, the first time a student completes a quest that
    contains at least one interactive_coding question, on their very
    first attempt (attempt.attempt_count == 1), with 100% accuracy.
    Call this from QuestSubmitView right alongside check_flawless_victory
    — same attempt_count==1 guard, so it's safe to call on every
    completion.
    """
    if attempt.attempt_count != 1 or attempt.accuracy != 100:
        return []

    has_coding_question = attempt.assignment.questions.filter(
        question_type="interactive_coding"
    ).exists()

    if has_coding_question:
        return _awarded(award_badge(student, "Flawless Coder"))
    return []


def check_coding_cadet(student):
    completed_assignment_ids = set(
        AssignmentAttempt.objects.filter(
            student=student, completed_at__isnull=False
        ).values_list("assignment_id", flat=True)
    )

    mission_ids = (
        countable_assignments()
        .values_list("lesson__mission_id", flat=True)
        .distinct()
    )

    for mission_id in mission_ids:
        mission_assignment_ids = set(
            countable_assignments().filter(
                lesson__mission_id=mission_id
            ).values_list("id", flat=True)
        )
        if mission_assignment_ids and mission_assignment_ids <= completed_assignment_ids:
            return _awarded(award_badge(student, "Coding Cadet"))

    return []


def check_ai_master(student):
    total_lessons = countable_lessons().count()
    attended_lessons = _distinct_attended_lesson_count(student)

    total_assignments = countable_assignments().count()
    completed_assignments = (
        AssignmentAttempt.objects.filter(
            student=student, completed_at__isnull=False, assignment__in=countable_assignments()
        )
        .values("assignment").distinct().count()
    )

    lessons_done = total_lessons > 0 and attended_lessons >= total_lessons
    assignments_done = total_assignments > 0 and completed_assignments >= total_assignments

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

    total_lessons = countable_lessons().count()
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