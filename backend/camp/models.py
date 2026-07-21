import uuid
from django.db import models
from users.models import Student

class Mission(models.Model):
    week = models.PositiveIntegerField()
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    is_published = models.BooleanField(default=False)


    def __str__(self):
        return f"Week {self.week}: {self.title}"


class Lesson(models.Model):
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=100)
    description = models.TextField()
    order = models.PositiveIntegerField()
    duration = models.DurationField()
    is_published = models.BooleanField(default=False) 

    def __str__(self):
        return f"{self.title} (Mission: {self.mission.title})"
    

class Badge(models.Model):
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=10, blank=True)
    rarity = models.CharField(max_length=50, choices=[('common', 'Common'), ('rare', 'Rare'), ('epic', 'Epic'), ('legendary', 'Legendary')])

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
    

class Assignment(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='assignments')
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    deadline = models.DateTimeField()
    is_published = models.BooleanField(default=False) 

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