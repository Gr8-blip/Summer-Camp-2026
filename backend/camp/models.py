import uuid
from django.db import models
from users.models import Student

class Mission(models.Model):
    week = models.PositiveIntegerField()
    title = models.CharField(max_length=100)
    description = models.TextField()
    xp_reward = models.IntegerField()
    is_active = models.BooleanField(default=True)


    def __str__(self):
        return f"Week {self.week}: {self.title}"


class Lesson(models.Model):
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=100)
    description = models.TextField()
    order = models.PositiveIntegerField()
    duration = models.DurationField()

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

    def __str__(self):
        return f"{self.title} (Lesson: {self.lesson.title})"
    
class Submission(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='submissions')
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
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="challenges"
    )
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()

    def __str__(self):
        return f"{self.title} (XP: {self.xp_reward})"
    
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
    

