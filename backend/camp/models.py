import uuid
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import Q
from users.models import Student

# Shared by Challenge and Assignment — the "classic" list-of-questions flow
# stays as the default so nothing breaks for existing content. Admins pick
# one of these per Challenge/Quest; the student frontend branches on this
# value to decide which game shell (or the classic flow) to render. Adding
# a new game later is just: add a choice here + a matching case in the
# frontend's GAME_COMPONENTS map — no model/serializer changes needed.
GAME_TYPES = [
    ("classic", "Classic (question list)"),
    ("dungeon_crawler", "Dungeon Crawler"),
    ("target_shooter", "Target Shooter"),
    ("escape_room", "Escape Room"),
    ("floor_is_lava", "Floor Is Lava"),
    ("ai_defense", "AI Defense"),
]

class Mission(models.Model):
    week = models.PositiveIntegerField()
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    is_published = models.BooleanField(default=False)
    # The Lost Grid reuses the existing week Mission so it stays visible in
    # the familiar admin and student flows.  A layout is a small JSON grid:
    # {"cells": ["########", "#......#", ...], "start": [1, 1]}.
    map_layout = models.JSONField(default=dict, blank=True)
    coin_reward = models.PositiveIntegerField(default=0)
    game_active = models.BooleanField(default=False)


    def __str__(self):
        return f"Week {self.week}: {self.title}"


class MazeObject(models.Model):
    """A configurable interaction in a mission map; question data remains
    owned by ChallengeQuestion and is never copied here."""
    TYPES = [
        ("question", "Question"), ("enemy", "Enemy"), ("clue", "Clue"),
        ("door", "Door"), ("key", "Key"), ("chest", "Chest"),
        ("weapon", "Weapon"), ("exit", "Exit"),
    ]
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="maze_objects")
    type = models.CharField(max_length=16, choices=TYPES)
    position = models.JSONField(default=list, help_text="[x, y] grid position")
    question = models.ForeignKey('ChallengeQuestion', null=True, blank=True, on_delete=models.SET_NULL, related_name='maze_objects')
    label = models.CharField(max_length=100, blank=True)
    reward_data = models.JSONField(default=dict, blank=True, help_text="XP, coins, item and effect configuration")
    required_item = models.CharField(max_length=100, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class MissionGameProgress(models.Model):
    """Per-student progress through a mission's Lost Grid quiz arena.

    There's no stored "current round/question" pointer on purpose — same
    as the old maze's `completed_objects`, the frontend derives "what's
    next" by walking the mission's rounds/questions against
    `answered_questions`. That keeps this model dumb (just a ledger of
    what happened) and the game.py view is the only source of truth for
    scoring.
    """
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="mission_game_progress")
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="game_progress")
    # Question ids already scored — the single guard against re-answering
    # (and re-earning reward for) the same question twice. Plays the same
    # role `completed_objects` played for the old maze.
    answered_questions = models.JSONField(default=list)
    correct_count = models.PositiveIntegerField(default=0)
    answered_count = models.PositiveIntegerField(default=0)
    # Round ids whose completion reward has already been paid out, so
    # resuming mid-round never double-pays the round-complete bonus.
    completed_rounds = models.JSONField(default=list)
    # XP/coins earned *within this run* — separate from the student's
    # account-wide totals, same split MissionGameProgress always used.
    xp = models.PositiveIntegerField(default=0)
    coins = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    # Consecutive-correct streak, live for the whole run (survives across
    # rounds, resets to 0 on any wrong/timed-out answer). Drives the
    # Bullseye/On Fire badges, the sneaky streak-milestone XP bonus, and
    # the "Comeback Kid" badge below.
    current_streak = models.PositiveIntegerField(default=0)
    # Whether this run has had at least one wrong/timed-out answer yet —
    # gates Comeback Kid so it can't fire on a student's very first
    # correct answer (there's nothing to "come back" from).
    had_miss = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "mission"], name="unique_student_mission_game")]


class Lesson(models.Model):
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=100)
    description = models.TextField()
    order = models.PositiveIntegerField()
    duration = models.DurationField()
    is_published = models.BooleanField(default=False) 
    # Optional downloadable material for the lesson (worksheets, starter
    # code, slide exports, etc). Zip-only, kept simple — no per-file
    # metadata model needed since it's one attachment per lesson.
    material_file = models.FileField(
        upload_to='lesson_materials/%Y/%m/',
        blank=True,
        null=True,
        validators=[FileExtensionValidator(allowed_extensions=['zip'])],
    )
    qa_enabled = models.BooleanField(
        default=False,
        help_text="If on, students see a Q&A box for this lesson on the Week 6 hub.",
    )
    # Short, ordered list of "remember this" bullets shown on the student
    # lesson page — plain list of strings, no separate model needed since
    # these are just admin-authored copy, not queryable/relational data.
    key_notes = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"{self.title} (Mission: {self.mission.title})"


    class Meta:
        ordering = ['order']


class LessonQuestion(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ANSWERED = "answered"
    STATUS_HIDDEN = "hidden"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ANSWERED, "Answered"),
        (STATUS_HIDDEN, "Hidden"),
    ]

    lesson = models.ForeignKey(Lesson, related_name="qa_questions", on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)  # who asked — admin-only, never serialized to students
    text = models.TextField()
    category = models.CharField(max_length=40, blank=True)  # e.g. "AI & The Future" — just the starter tag they tapped, optional
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
    

class Badge(models.Model):
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=10, blank=True)
    rarity = models.CharField(max_length=50, choices=[('common', 'Common'), ('rare', 'Rare'), ('epic', 'Epic'), ('legendary', 'Legendary'), ('mythical', 'Mythical')])

    def __str__(self):
        return f"{self.name} ({self.rarity})"
    

class StudentBadge(models.Model):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "badge"],
                name="unique_student_badge"
            )
        ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='badges')
    badge = models.ForeignKey(Badge, on_delete=models.CASCADE, related_name='students')
    earned_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.full_name} earned {self.badge.name} on {self.earned_at}"
    
class XPLog(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='xp_logs')
    amount = models.IntegerField()
    reason = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.student.full_name} - {self.amount} XP ({self.reason})"


class CoinLog(models.Model):
    """
    Mirrors XPLog exactly. Coins are earned through gameplay performance
    (speed, no mistakes, potions/pickups found, etc.) rather than the
    fixed one-time reward XP gives — a second, replayable progression
    track. Not spendable through gameplay (spent via the Marketplace
    instead — see CosmeticItem/StudentCosmetic below).
    """
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='coin_logs')
    amount = models.IntegerField()
    reason = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.full_name} - {self.amount} coins ({self.reason})"
    

class Assignment(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='assignments')
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    deadline = models.DateTimeField()
    is_published = models.BooleanField(default=False) 
    game_type = models.CharField(max_length=32, choices=GAME_TYPES, default="classic")

    def __str__(self):
        return f"{self.title} (Lesson: {self.lesson.title})"

 
    
class Submission(models.Model):
    assignment = models.OneToOneField(Assignment, on_delete=models.CASCADE, related_name='submission')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='submissions')
    status = models.CharField(max_length=20, choices=[('pending', 'Pending'), ('graded', 'Graded')], default='pending')
    submission_text = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    feedback = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.student.full_name} - {self.assignment.title} ({self.status})"
    
class Challenge(models.Model):
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    mission = models.ForeignKey(Mission, on_delete=models.SET_NULL, null=True, blank=True, related_name="challenges")
    time_limit = models.PositiveIntegerField(default=600, help_text="Time allowed in seconds")
    is_published = models.BooleanField(default=False) 
    created_at = models.DateTimeField(auto_now_add=True)
    game_type = models.CharField(max_length=32, choices=GAME_TYPES, default="classic")

    def __str__(self):
        return f"{self.title} (XP: {self.xp_reward})"


class ChallengeQuestion(models.Model):
    QUESTION_TYPES = [
        ("multiple_choice", "Multiple choice"), ("true_false", "True / false"),
        ("drag_order", "Drag order"), ("match_pairs", "Match pairs"),
        ("fill_blank", "Fill in the blank"), ("prompt_build", "Prompt build"),

        # Puzzle Games
        ("memory_tiles", "Memory Tiles"),
        ("word_search", "Word Search"),
        ("image_reveal", "Image Reveal"),

        # NEW — coding challenges. content JSON shape:
        # {
        #   "instruction": "...",
        #   "languages": ["html", "css", "js"],
        #   "files": [{"path": "index.html", "content": "..."}, ...],
        #   "checks": [
        #     {"type": "element_text", "selector": "h1", "expected": "Mission Control"},
        #     {"type": "css_property", "selector": "h1", "property": "color", "expected": "blue"},
        #     {"type": "element_exists", "selector": "button"},
        #     {"type": "element_attribute", "selector": "img", "attribute": "alt", "expected": "logo"},
        #     {"type": "document_title", "expected": "My Mission"}
        #   ]
        # }
        # `points` (below) is split evenly across `checks` for partial credit
        # — see utils/scoring.py.
        ("interactive_coding", "Interactive Coding"),
        ("coding_challenge", "Coding Challenge"),

        # NEW — project submission. content JSON shape:
        # {
        #   "instruction": "Prepare your website for launch.",
        #   "submission": {"url": true, "zip": true},   # which inputs to show/require
        #   "checks": [
        #     {"type": "url_status", "target": "url", "expected": 200},
        #     {"type": "file_exists", "target": "zip", "path": "index.html"},
        #     {"type": "same_directory", "target": "zip",
        #      "files": ["index.html", "style.css", "script.js"]},
        #     {"type": "text_exists", "target": "zip", "path": "index.html", "text": "Mission Control"},
        #     {"type": "text_exists", "target": "url", "text": "Mission Control"},
        #     {"type": "element_exists", "target": "zip", "path": "index.html", "selector": "h1"},
        #     {"type": "element_exists", "target": "url", "selector": "h1"}
        #   ]
        # }
        # `target` picks where a check runs — "zip" inspects the extracted
        # archive, "url" inspects the live site. Verification always runs
        # server-side (utils/project_verifier.py); the student's reported
        # pass/fail is never trusted directly — see utils/scoring.py and
        # ProjectSubmission below.
        ("project_submission", "Project Submission"),
    ]
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="questions")
    question_type = models.CharField(max_length=32, choices=QUESTION_TYPES)
    order = models.PositiveIntegerField(default=0)
    points = models.PositiveIntegerField(default=10)
    content = models.JSONField(default=dict)

    class Meta:
        ordering = ["order", "id"]


class ChallengeAttempt(models.Model):
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="challenge_attempts")
    score = models.PositiveIntegerField(default=0)
    accuracy = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    xp_earned = models.PositiveIntegerField(default=0)
    time_taken = models.PositiveIntegerField(default=0, help_text="Seconds")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["challenge", "student"], name="one_attempt_per_challenge")]

    def __str__(self):
        return f"{self.student.full_name} challenge attempt"


class ChallengeWin(models.Model):
    challenge = models.OneToOneField(Challenge, on_delete=models.CASCADE, related_name="win")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="challenge_wins")
    score = models.PositiveIntegerField()
    time_taken = models.PositiveIntegerField(help_text="Seconds, snapshot at finalization")
    awarded_at = models.DateTimeField(auto_now_add=True)
 
    def __str__(self):
        return f"{self.student.full_name} won {self.challenge.title}"
    

class AssignmentQuestion(models.Model):
    """
    Mirrors ChallengeQuestion exactly (same question_type choices, same
    content JSON shape) so every serializer/scoring/frontend renderer built
    for Challenges works unchanged for Quests too.
    """
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="questions")
    question_type = models.CharField(max_length=32, choices=ChallengeQuestion.QUESTION_TYPES)
    order = models.PositiveIntegerField(default=0)
    points = models.PositiveIntegerField(default=10)
    content = models.JSONField(default=dict)
 
    class Meta:
        ordering = ["order", "id"]


class LostGridRound(models.Model):
    """One themed round of the Lost Grid quiz arena (e.g. "⚡ QUICK FIRE")."""
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="lostgrid_rounds")
    title = models.CharField(max_length=100)
    icon = models.CharField(max_length=10, blank=True, default="⚡")
    order = models.PositiveIntegerField(default=0)
    xp_reward = models.PositiveIntegerField(default=0)
    coin_reward = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.mission.title} — Round {self.order + 1}: {self.title}"


class LostGridQuestion(models.Model):
    """A question inside a Lost Grid round.

    Question data is either borrowed live from the question bank
    (`source_question` set — same "never copy the bank's content" rule
    MazeObject used to follow) or authored inline for this round only
    (`source_question` null, `question_type`/`content`/`points` filled in
    directly).

    NOTE: `project_submission` questions MUST use `source_question` — the
    scoring for that type (utils/scoring.py) compares
    `submission.question != question` by primary key, which only works
    against a real, saved ChallengeQuestion. This is enforced in the admin
    serializer, not here.
    """
    round = models.ForeignKey(LostGridRound, on_delete=models.CASCADE, related_name="questions")
    source_question = models.ForeignKey(
        'ChallengeQuestion', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='lostgrid_questions',
        help_text="Pulls live content from the question bank instead of the inline fields below.",
    )
    question_type = models.CharField(max_length=32, choices=ChallengeQuestion.QUESTION_TYPES, blank=True)
    points = models.PositiveIntegerField(default=10)
    content = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)
    # Lost Grid only — not part of the shared ChallengeQuestion content, so
    # it applies the same whether this question is bank-linked or authored
    # inline. Null/blank = no limit. When it expires the frontend submits
    # {"timed_out": true} instead of a normal answer; the answer view must
    # treat that as an automatic wrong answer *before* running the
    # per-question-type comparison (see game.py).
    time_limit = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Seconds allowed to answer before it's auto-skipped as timed out. Blank = no limit.",
    )

    class Meta:
        ordering = ["order", "id"]

    @property
    def effective_type(self):
        return self.source_question.question_type if self.source_question_id else self.question_type

    @property
    def effective_content(self):
        return self.source_question.content if self.source_question_id else self.content

    @property
    def effective_points(self):
        return self.source_question.points if self.source_question_id else self.points
 
 
class AssignmentAttempt(models.Model):
    """
    Mirrors ChallengeAttempt, but a Quest is retryable until completed and
    carries no time pressure — so no time_limit checks are ever applied to
    it (time_taken is still logged for stats/consistency, just not scored).
    """
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="assignment_attempts")
    score = models.PositiveIntegerField(default=0)
    accuracy = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    xp_earned = models.PositiveIntegerField(default=0)
    attempt_count = models.PositiveIntegerField(default=0)   # how many times submitted
    time_taken = models.PositiveIntegerField(default=0, help_text="Seconds, informational only")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
 
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["assignment", "student"], name="one_row_per_quest_student")
        ]


    def __str__(self):
        return f"{self.student.full_name} assignment attempt"


class AttendanceSession(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='attendance_sessions')
    code = models.CharField(max_length=10, unique=True)
    expires_at = models.DateTimeField()
    xp_reward = models.IntegerField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Attendance Session for {self.lesson.title} (Code: {self.code})"
    
class StudentAttendance(models.Model):
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "attendance_session"],
                name="unique_attendance"
            )
        ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attendances')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='attendances')
    attendance_session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='attendances')
    submitted_at = models.DateTimeField(auto_now_add=True)


    def __str__(self):
        return f"{self.student.full_name} attended {self.lesson.title} on {self.submitted_at}"


class PuzzleCompletion(models.Model):
    """
    Records the first time a student successfully completes a question of
    a given puzzle type (drag_order, match_pairs, memory_tiles, word_search,
    image_reveal, prompt_build), regardless of which Challenge it came from.
    """
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "puzzle_type"],
                name="unique_student_puzzle_type",
            )
        ]
 
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="puzzle_completions")
    puzzle_type = models.CharField(max_length=32, choices=ChallengeQuestion.QUESTION_TYPES)
    question = models.ForeignKey(ChallengeQuestion, on_delete=models.SET_NULL, null=True, blank=True)
    assignment_question = models.ForeignKey(AssignmentQuestion, on_delete=models.SET_NULL, null=True, blank=True)
    completed_at = models.DateTimeField(auto_now_add=True)
 
    def __str__(self):
        return f"{self.student.full_name} completed {self.puzzle_type}"

class AIConversation(models.Model):
    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Conversation {self.id} - {self.title} (Student: {self.student.full_name})"
    
class AIMessage(models.Model):
    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=[('user', 'User'), ('assistant', 'Assistant')])
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Message {self.id} in Conversation {self.conversation.id} - Role: {self.role}"
    


class CampSettings(models.Model):
    """
    Singleton row (id is always forced to 1). Global on/off switch for the
    whole bootcamp. When camp_started=False, content is still *visible* to
    students (missions/lessons/quests/challenges still list normally) but
    locked from interaction — start/submit/attendance endpoints refuse.
    """
    camp_started = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
 
    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
 
    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
 
    def __str__(self):
        return f"Camp {'STARTED' if self.camp_started else 'NOT STARTED'}"
 
 
class MissionCompletion(models.Model):
    """
    Marks that a student has completed a Mission (attendance recorded for
    every lesson in it) and been paid its xp_reward. Existence of this row
    is the single source of truth for "already awarded" — prevents
    double-paying XP if attendance is recalculated/re-triggered.
    """
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "mission"], name="unique_mission_completion")
        ]
 
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="mission_completions")
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="completions")
    xp_awarded = models.IntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)
 
    def __str__(self):
        return f"{self.student.full_name} completed Mission: {self.mission.title}"


# ─────────────────────────────────────────────────────────────────────────
# MARKETPLACE (Part 1): Coins → Cosmetics → Avatars / Themes / Victory FX
# ─────────────────────────────────────────────────────────────────────────

class CosmeticItem(models.Model):
    CATEGORY = [
        ("avatar", "Avatar"),
        ("theme", "Theme"),
        ("victory_effect", "Victory Effect"),
    ]
    category = models.CharField(max_length=20, choices=CATEGORY)
    key = models.SlugField(unique=True)             # e.g. "cadet", "cyber_blue", "star_burst"
    name = models.CharField(max_length=100)          # display label, e.g. "🧑‍🚀 Cadet"
    price = models.PositiveIntegerField(default=0)   # 0 = free / starter item, always "owned"
    order = models.PositiveIntegerField(default=0)   # display order within category
    is_active = models.BooleanField(default=True)    # admins retire items without deleting/breaking ownership history

    class Meta:
        ordering = ["category", "order", "price"]

    def __str__(self):
        return f"{self.name} ({self.category}, {self.price}c)"


class StudentCosmetic(models.Model):
    """
    Ownership record. A row existing here = owned. Free items (price=0)
    don't need a row — they're treated as owned by everyone (see
    utils/marketplace.py:owns_item). Keeps the ledger only tracking
    actual purchases.
    """
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "item"], name="unique_owned_cosmetic")
        ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="owned_cosmetics")
    item = models.ForeignKey(CosmeticItem, on_delete=models.CASCADE, related_name="owners")
    acquired_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.full_name} owns {self.item.name}"


class Notification(models.Model):
    student = models.ForeignKey(
        Student, related_name="notifications", on_delete=models.CASCADE
    )
    kind = models.CharField(max_length=32)  # "badge", "coins", etc.
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "read_at"]),
        ]

# ─────────────────────────────────────────────────────────────────────────
# PROJECT SUBMISSION verification runs (question_type="project_submission")
# ─────────────────────────────────────────────────────────────────────────

def project_submission_zip_upload_to(instance, filename):
    return f"project_submissions/{instance.student_id}/{filename}"


class ProjectSubmission(models.Model):
    """
    One row per verification run for a `project_submission` question.
    Created by the check endpoint (utils/project_verifier.py via
    api/project_submission.py) every time a student submits a URL and/or
    ZIP to be checked — a student can re-check freely before the final
    quiz submit. `challenge_question` / `assignment_question` mirror the
    ChallengeQuestion/AssignmentQuestion split used everywhere else
    (PuzzleCompletion above does the same thing) since a project_submission
    question can live on either a Challenge or a Quest.

    score_fraction is computed by the verifier and stored here — the
    Challenge/Quest submit views look it up by id (see utils/scoring.py)
    rather than trusting anything the client sends back, same "never trust
    client-supplied credit" rule ChallengeSubmitView already follows for
    coins.
    """

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="project_submissions")
    challenge_question = models.ForeignKey(
        ChallengeQuestion, on_delete=models.CASCADE, null=True, blank=True,
        related_name="project_submissions",
    )
    assignment_question = models.ForeignKey(
        AssignmentQuestion, on_delete=models.CASCADE, null=True, blank=True,
        related_name="project_submissions",
    )
    submitted_url = models.URLField(blank=True)
    submitted_zip = models.FileField(
        upload_to=project_submission_zip_upload_to,
        blank=True, null=True,
        validators=[FileExtensionValidator(allowed_extensions=["zip"])],
    )
    # Per-check pass/fail detail — see utils/project_verifier.py:run_checks
    results = models.JSONField(default=list)
    score_fraction = models.DecimalField(max_digits=4, decimal_places=3, default=0)  # 0.000–1.000
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(challenge_question__isnull=False, assignment_question__isnull=True) |
                    Q(challenge_question__isnull=True, assignment_question__isnull=False)
                ),
                name="project_submission_exactly_one_question",
            )
        ]

    @property
    def question(self):
        return self.challenge_question or self.assignment_question

    def __str__(self):
        return f"{self.student.full_name} project submission ({self.score_fraction})"