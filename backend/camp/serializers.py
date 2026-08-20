import random
from rest_framework import serializers
from users.serializers import StudentSerializer
from .models import Assignment, Mission, Lesson, Badge, Submission, Challenge, ChallengeQuestion, ChallengeAttempt, StudentBadge, XPLog, AttendanceSession, StudentAttendance, AIConversation, AIMessage, MissionCompletion
from .models import AssignmentQuestion, AssignmentAttempt, CampSettings
from .utils.mission_progress import mission_progress


def _mission_locked(mission):
    from .utils.camp import camp_is_started
    return (not mission.is_published) or (not camp_is_started())


def _lesson_class_missed(student, lesson):
    """True when this lesson's attendance window has fully closed (an
    AttendanceSession for it expired) and the student never got a
    StudentAttendance recorded — a permanently missed class, distinct from
    "hasn't happened yet"."""
    from django.utils import timezone
    if StudentAttendance.objects.filter(student=student, lesson=lesson).exists():
        return False
    return lesson.attendance_sessions.filter(expires_at__lt=timezone.now()).exists()


def _mission_attendance_resolved(student, mission):
    """A mission's Challenge unlocks once every published lesson's
    attendance window has been resolved one way or another — attended OR
    missed (session expired without attendance) — so a single missed class
    doesn't permanently lock the boss battle out for the rest of the week."""
    for lesson in mission.lessons.filter(is_published=True):
        if StudentAttendance.objects.filter(student=student, lesson=lesson).exists():
            continue
        if not _lesson_class_missed(student, lesson):
            return False
    return True


def _avatar_key(student):
    """Shared helper: returns the equipped avatar's key, or None if the
    student hasn't equipped one yet. Used by both attempt serializers so
    leaderboards and completion screens render the same avatar."""
    return student.equipped_avatar.key if getattr(student, "equipped_avatar_id", None) else None


class MissionListSerializer(serializers.ModelSerializer):
    lesson_count = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()
    missed_lesson_count = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = ['id', 'week', 'title', 'description', 'xp_reward', 'lesson_count', 'is_published', 'progress', 'locked', 'missed_lesson_count']

    def get_lesson_count(self, obj):
        return obj.lessons.count()

    def _student(self):
        request = self.context.get("request")
        if request and hasattr(request.user, "student"):
            return request.user.student
        return None

    def get_progress(self, obj):
        student = self._student()
        if not student:
            return None
        return mission_progress(student, obj)

    def get_locked(self, obj):
        return _mission_locked(obj)

    def get_missed_lesson_count(self, obj):
        student = self._student()
        if not student:
            return 0
        return sum(
            1 for lesson in obj.lessons.filter(is_published=True)
            if _lesson_class_missed(student, lesson)
        )


class LessonSerializer(serializers.ModelSerializer):
    locked = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()
    quests_completed = serializers.SerializerMethodField()
    quests_in_progress = serializers.SerializerMethodField()
    quests_missed = serializers.SerializerMethodField()
    class_missed = serializers.SerializerMethodField()
    material_filename = serializers.SerializerMethodField()
    material_size = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'description', 'order', 'duration', 
            'mission', 'is_published', 'locked', 'completed', 'quests_completed',
            'quests_in_progress', 'quests_missed', 'class_missed',
            'material_file', 'material_filename', 'material_size', 'key_notes',
        ]

    def get_material_filename(self, obj):
        return obj.material_file.name.rsplit('/', 1)[-1] if obj.material_file else None

    def get_material_size(self, obj):
        # Bytes, so the frontend can format it however it wants (KB/MB).
        # .size touches storage — only called when a file is actually set.
        try:
            return obj.material_file.size if obj.material_file else None
        except (OSError, ValueError):
            return None

    def get_locked(self, obj):
        if _mission_locked(obj.mission):
            return True
        return not obj.is_published

    def get_completed(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        student = request.user.student
        return StudentAttendance.objects.filter(student=student, lesson=obj).exists()

    def get_quests_completed(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        
        student = request.user.student
        assignments = obj.assignments.filter(is_published=True)
        if not assignments.exists():
            return True

        for assignment in assignments:
            if assignment.questions.exists():
                done = AssignmentAttempt.objects.filter(
                    assignment=assignment, student=student, completed_at__isnull=False
                ).exists()
            else:
                done = Submission.objects.filter(
                    assignment=assignment, student=student
                ).exists()
            if not done:
                return False

        return True

    def get_quests_in_progress(self, obj):
        """
        True when at least one of this lesson's question-based quests has
        an AssignmentAttempt (they started it) that isn't completed (they
        haven't hit 100% yet) — lets the frontend tell "never touched"
        apart from "tried, fell short" instead of lumping both under one
        pending badge.
        """
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False

        student = request.user.student
        for assignment in obj.assignments.filter(is_published=True):
            if not assignment.questions.exists():
                continue  # legacy free-text assignments have no retry state
            attempted = AssignmentAttempt.objects.filter(assignment=assignment, student=student).exists()
            completed = AssignmentAttempt.objects.filter(
                assignment=assignment, student=student, completed_at__isnull=False
            ).exists()
            if attempted and not completed:
                return True
        return False

    def get_quests_missed(self, obj):
        """True when at least one of this lesson's quests had a started
        (but never completed) attempt AND its deadline has now passed —
        the student had a shot and ran out of time, as opposed to
        quests_in_progress where there's still time left."""
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        from django.utils import timezone
        student = request.user.student
        now = timezone.now()
        for assignment in obj.assignments.filter(is_published=True):
            if not assignment.questions.exists():
                continue
            if now < assignment.deadline:
                continue
            completed = AssignmentAttempt.objects.filter(
                assignment=assignment, student=student, completed_at__isnull=False
            ).exists()
            if completed:
                continue
            attempted = AssignmentAttempt.objects.filter(assignment=assignment, student=student).exists()
            if attempted:
                return True
        return False

    def get_class_missed(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        return _lesson_class_missed(request.user.student, obj)


class AssignmentSerializer(serializers.ModelSerializer):
    already_submitted = serializers.SerializerMethodField(read_only=True)
    attempted = serializers.SerializerMethodField(read_only=True)
    best_accuracy = serializers.SerializerMethodField(read_only=True)
    has_questions = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)

    class Meta:
        model = Assignment
        fields = [
            'id', 'title', 'description', 'xp_reward', 'deadline', 
            'lesson', 'lesson_title', 'already_submitted', 'attempted',
            'best_accuracy', 'is_published', 
            'locked', 'has_questions', 'is_expired', 'game_type'
        ]

    def get_is_expired(self, obj):
        from django.utils import timezone
        return timezone.now() >= obj.deadline

    def get_already_submitted(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        student = request.user.student

        if obj.questions.exists():
            return AssignmentAttempt.objects.filter(
                assignment=obj,
                student=student,
                completed_at__isnull=False,
            ).exists()

        return Submission.objects.filter(
            assignment=obj,
            student=student
        ).exists()

    def get_attempted(self, obj):
        """True once the student has an AssignmentAttempt row at all,
        completed or not — the "tried this before" signal the frontend
        uses to swap Start Quest for Retry Quest."""
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        if not obj.questions.exists():
            return False  # legacy free-text assignments have no retry state
        student = request.user.student
        return AssignmentAttempt.objects.filter(assignment=obj, student=student).exists()

    def get_best_accuracy(self, obj):
        """Latest attempt's accuracy (0-100), or None if never attempted /
        a legacy free-text assignment. Quests are retryable in place — one
        AssignmentAttempt row per student per assignment — so "latest" is
        also the only one."""
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return None
        if not obj.questions.exists():
            return None
        student = request.user.student
        attempt = AssignmentAttempt.objects.filter(assignment=obj, student=student).first()
        return attempt.accuracy if attempt else None
    
    def get_has_questions(self, obj):
        return obj.questions.exists()

    def get_locked(self, obj):
        from .utils.camp import camp_is_started

        if (not obj.is_published) or (not camp_is_started()):
            return True

        if obj.lesson and _mission_locked(obj.lesson.mission):
            return True

        # Quests for a lesson only unlock once attendance has been
        # recorded for that lesson.
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return True

        if not obj.lesson:
            return False

        student = request.user.student
        attended = StudentAttendance.objects.filter(student=student, lesson=obj.lesson).exists()
        return not attended


class AssignmentQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentQuestion
        fields = ['id', 'assignment', 'question_type', 'order', 'points', 'content']
        read_only_fields = ['assignment']


class SubmissionListSerializer(serializers.ModelSerializer):
    assignment = AssignmentSerializer(read_only=True)
    student = StudentSerializer(read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment",
            "submission_text",
            "status",
            "submitted_at",
            "feedback",
            "student",
        ]
        read_only_fields = fields


class SubmissionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = [
            "submission_text",
        ]

class SubmissionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ['id', 'assignment', 'student', 'submitted_at', 'status', 'feedback']


class ChallengeSerializer(serializers.ModelSerializer):
    locked = serializers.SerializerMethodField()
    already_completed = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    is_not_yet_open = serializers.SerializerMethodField()

    class Meta:
        model = Challenge
        fields = ['id', 'title', 'description', 'xp_reward', 'start_date', 'end_date', 'mission', 'time_limit', 'created_at', 'is_published', 'locked', 'already_completed', 'is_expired', 'is_not_yet_open', 'game_type']

    def get_is_expired(self, obj):
        from django.utils import timezone
        return timezone.now() >= obj.end_date

    def get_is_not_yet_open(self, obj):
        from django.utils import timezone
        return timezone.now() < obj.start_date

    def get_locked(self, obj):
        from .utils.camp import camp_is_started
        request = self.context.get("request")

        if not request or not hasattr(request.user, "student"):
            return True

        if _mission_locked(obj.mission):
            return True

        student = request.user.student

        # Used to require a full MissionCompletion (100% attendance) before
        # the boss battle would open. Changed so a missed class doesn't
        # permanently lock a student out — the challenge unlocks once every
        # lesson's attendance window has been resolved, attended or missed.
        resolved = _mission_attendance_resolved(student, obj.mission)

        return (not obj.is_published) or (not camp_is_started()) or (not resolved)

    def get_already_completed(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        student = request.user.student
        return ChallengeAttempt.objects.filter(
            challenge=obj,
            student=student,
            completed_at__isnull=False,
        ).exists()


class ChallengeQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChallengeQuestion
        fields = ['id', 'challenge', 'question_type', 'order', 'points', 'content']
        read_only_fields = ['challenge']

class StudentChallengeQuestionSerializer(ChallengeQuestionSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        content = dict(data['content'])

        for key in ('answer', 'answers', 'solution', 'example_solution'):
            content.pop(key, None)


        if instance.question_type == 'match_pairs':
            pairs = instance.content.get('pairs', {})
            left = list(pairs.keys())
            right = list(pairs.values())
            random.shuffle(right)
            content.pop('pairs', None)
            content['left'] = left
            content['right'] = right


        elif instance.question_type == 'drag_order':
            items = list(instance.content.get('items', []))
            shuffled_items = items[:]
            random.shuffle(shuffled_items)
            if len(shuffled_items) > 1 and shuffled_items == items:
                shuffled_items.reverse()
            content['items'] = shuffled_items

        data['content'] = content
        return data

class ChallengeAttemptSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_avatar = serializers.SerializerMethodField()
    challenge_title = serializers.CharField(source='challenge.title', read_only=True)
    mission_title = serializers.SerializerMethodField()

    class Meta:
        model = ChallengeAttempt
        fields = ['id', 'challenge', 'challenge_title', 'mission_title', 'student', 'student_name', 'student_avatar', 'score', 'accuracy', 'xp_earned', 'time_taken', 'started_at', 'completed_at']
        read_only_fields = fields

    def get_mission_title(self, obj):
        return obj.challenge.mission.title if obj.challenge.mission_id else None

    def get_student_avatar(self, obj):
        return _avatar_key(obj.student)

class BadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Badge
        fields = ['id', 'name', 'icon', 'rarity']

class StudentBadgeSerializer(serializers.ModelSerializer):
    badge = BadgeSerializer(read_only=True)

    class Meta:
        model = StudentBadge
        fields = ['badge', 'earned_at']

class AttendanceSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceSession
        fields = ['id', 'code', 'lesson', 'expires_at', 'xp_reward', 'is_active']

class StudentAttendanceSerializer(serializers.ModelSerializer):
    lesson = LessonSerializer(read_only=True)
    student = StudentSerializer(read_only=True)

    class Meta:
        model = StudentAttendance
        fields = ['id', 'lesson', 'submitted_at', 'student']

class XPLogSerializer(serializers.ModelSerializer):
    student = StudentSerializer(read_only=True)

    class Meta:
        model = XPLog
        fields = ['id', 'amount', 'reason', 'student']


class StudentAssignmentQuestionSerializer(AssignmentQuestionSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        content = dict(data['content'])

        for key in ('answer', 'answers', 'solution', 'example_solution'):
            content.pop(key, None)

        if instance.question_type == 'interactive_coding':
            # `checks` and `files` are meant to reach the student (the
            # client needs them to seed the editor and run validation in
            # the sandboxed iframe) — but scrub any stray solution field an
            # admin might accidentally paste into an individual check.
            checks = content.get('checks', [])
            content['checks'] = [
                {k: v for k, v in c.items() if k not in ('solution', 'reference_answer')}
                for c in checks
            ]

        if instance.question_type == 'match_pairs':
            pairs = instance.content.get('pairs', {})
            left = list(pairs.keys())
            right = list(pairs.values())
            random.shuffle(right)
            content.pop('pairs', None)
            content['left'] = left
            content['right'] = right

        elif instance.question_type == 'drag_order':
            items = list(instance.content.get('items', []))
            shuffled_items = items[:]
            random.shuffle(shuffled_items)
            if len(shuffled_items) > 1 and shuffled_items == items:
                shuffled_items.reverse()
            content['items'] = shuffled_items

        data['content'] = content
        return data


class AssignmentAttemptSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_avatar = serializers.SerializerMethodField()
    assignment_title = serializers.CharField(source='assignment.title', read_only=True)
    mission_title = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentAttempt
        fields = ['id', 'assignment', 'assignment_title', 'mission_title', 'student', 'student_name', 'student_avatar', 'score', 'accuracy',
                  'xp_earned', 'attempt_count', 'time_taken', 'started_at', 'completed_at']
        read_only_fields = fields

    def get_mission_title(self, obj):
        lesson = obj.assignment.lesson
        return lesson.mission.title if lesson and lesson.mission_id else None

    def get_student_avatar(self, obj):
        return _avatar_key(obj.student)


class CampSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampSettings
        fields = ['camp_started']


class AIConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConversation
        fields = ['id', 'created_at', 'updated_at']


class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = ['role', 'content', 'created_at']


class MissionDetailSerializer(serializers.ModelSerializer):
    lessons = LessonSerializer(many=True, read_only=True)
    challenges = ChallengeSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = ['id', 'week', 'title', 'description', 'xp_reward', 'lessons', 'progress', 'locked', 'is_published', 'challenges']

    def _student(self):
        request = self.context.get("request")
        if request and hasattr(request.user, "student"):
            return request.user.student
        return None

    def get_progress(self, obj):
        student = self._student()
        if not student:
            return None
        return mission_progress(student, obj)

    def get_locked(self, obj):
        return _mission_locked(obj)


class LessonDetailSerializer(serializers.ModelSerializer):
    assignments = AssignmentSerializer(many=True, read_only=True)
    challenges = ChallengeSerializer(many=True, read_only=True)
    material_filename = serializers.SerializerMethodField()
    material_size = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'description', 'order', 'duration', 'assignments', 'challenges', 'is_published',
            'material_file', 'material_filename', 'material_size', 'key_notes',
        ]

    def get_material_filename(self, obj):
        return obj.material_file.name.rsplit('/', 1)[-1] if obj.material_file else None

    def get_material_size(self, obj):
        try:
            return obj.material_file.size if obj.material_file else None
        except (OSError, ValueError):
            return None


class DashboardStudentSerializer(serializers.Serializer):
    name = serializers.CharField()
    xp = serializers.IntegerField()

class DashboardSerializer(serializers.Serializer):
    student = DashboardStudentSerializer()
    missions = MissionListSerializer(many=True)
    recent_badges = StudentBadgeSerializer(many=True)
    recent_xp = XPLogSerializer(many=True)
    recent_attendance = StudentAttendanceSerializer(many=True)
    recent_conversations = AIConversationSerializer(many=True)


# ─────────────────────────────────────────────────────────────────────────
# MARKETPLACE serializers
# ─────────────────────────────────────────────────────────────────────────

from .models import CosmeticItem, StudentCosmetic  # noqa: E402


class CosmeticItemSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = CosmeticItem
        fields = ['id', 'category', 'key', 'name', 'price', 'status']

    def get_status(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return "locked"
        student = request.user.student

        equipped_ids = {
            student.equipped_avatar_id,
            student.equipped_theme_id,
            student.equipped_victory_effect_id,
        }
        if obj.id in equipped_ids:
            return "equipped"

        owned = obj.price == 0 or StudentCosmetic.objects.filter(student=student, item=obj).exists()
        return "owned" if owned else "locked"


class StudentCosmeticSerializer(serializers.ModelSerializer):
    item = CosmeticItemSerializer(read_only=True)

    class Meta:
        model = StudentCosmetic
        fields = ['item', 'acquired_at']