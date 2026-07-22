import random
from rest_framework import serializers
from users.serializers import StudentSerializer
from .models import Assignment, Mission, Lesson, Badge, Submission, Challenge, ChallengeQuestion, ChallengeAttempt, StudentBadge, XPLog, AttendanceSession, StudentAttendance, AIConversation, AIMessage, MissionCompletion
from .models import AssignmentQuestion, AssignmentAttempt, CampSettings
from .utils.mission_progress import mission_progress


def _mission_locked(mission):
    from .utils.camp import camp_is_started
    return (not mission.is_published) or (not camp_is_started())


class MissionListSerializer(serializers.ModelSerializer):
    lesson_count = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = ['id', 'week', 'title', 'description', 'xp_reward', 'lesson_count', 'is_published', 'progress', 'locked']

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


class LessonSerializer(serializers.ModelSerializer):
    locked = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'description', 'order', 'duration', 'mission', 'is_published', 'locked', 'completed']

    def get_locked(self, obj):
        # A lesson inherits its mission's lock state — if the mission is
        # locked (unpublished or camp not started), every lesson under it
        # is locked regardless of the lesson's own is_published flag.
        # If the mission is published/unlocked, fall back to the lesson's
        # own is_published flag.
        if _mission_locked(obj.mission):
            return True
        return not obj.is_published

    def get_completed(self, obj):
        # A lesson counts as "completed" once attendance has been recorded
        # for it — same signal that unlocks that lesson's quests.
        request = self.context.get("request")
        if not request or not hasattr(request.user, "student"):
            return False
        student = request.user.student
        return StudentAttendance.objects.filter(student=student, lesson=obj).exists()


class AssignmentSerializer(serializers.ModelSerializer):
    already_submitted = serializers.SerializerMethodField(read_only=True)
    has_questions = serializers.SerializerMethodField()
    locked = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = ['id', 'title', 'description', 'xp_reward', 'deadline', 'lesson', 'already_submitted', 'is_published', 'locked', 'has_questions']

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

    class Meta:
        model = Challenge
        fields = ['id', 'title', 'description', 'xp_reward', 'start_date', 'end_date', 'mission', 'time_limit', 'created_at', 'is_published', 'locked', 'already_completed']

    def get_locked(self, obj):
        from .utils.camp import camp_is_started
        request = self.context.get("request")

        if not request or not hasattr(request.user, "student"):
            return True

        if _mission_locked(obj.mission):
            return True

        student = request.user.student

        completed = MissionCompletion.objects.filter(
            student=student,
            mission=obj.mission,
        ).exists()

        return (not obj.is_published) or (not camp_is_started()) or (not completed)

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
    class Meta:
        model = ChallengeAttempt
        fields = ['id', 'challenge', 'student', 'student_name', 'score', 'accuracy', 'xp_earned', 'time_taken', 'started_at', 'completed_at']
        read_only_fields = fields

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

    class Meta:
        model = AssignmentAttempt
        fields = ['id', 'assignment', 'student', 'student_name', 'score', 'accuracy',
                  'xp_earned', 'attempt_count', 'time_taken', 'started_at', 'completed_at']
        read_only_fields = fields


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

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'description', 'order', 'duration', 'assignments', 'challenges', 'is_published']


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