from rest_framework import serializers
from users.serializers import StudentSerializer
from .models import Assignment, Mission, Lesson, Badge, Submission, Challenge, StudentBadge, XPLog, AttendanceSession, StudentAttendance, AIConversation, AIMessage
from users.models import Student, Family, Payment

class MissionListSerializer(serializers.ModelSerializer):
    lesson_count = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = ['id', 'week', 'title', 'description', 'xp_reward', 'lesson_count']

    def get_lesson_count(self, obj):
        return obj.lessons.count()

class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ['id', 'title', 'description', 'order', 'duration', 'mission']

class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ['id', 'title', 'description', 'xp_reward', 'deadline', 'lesson']

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
    class Meta:
        model = Challenge
        fields = ['id', 'title', 'description', 'xp_reward', 'start_date', 'end_date', 'lesson']

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

    class Meta:
        model = Mission
        fields = ['id', 'week', 'title', 'description', 'xp_reward', 'lessons']

class LessonDetailSerializer(serializers.ModelSerializer):
    assignments = AssignmentSerializer(many=True, read_only=True)
    challenges = ChallengeSerializer(many=True, read_only=True)

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'description', 'order', 'duration', 'assignments', 'challenges']


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

