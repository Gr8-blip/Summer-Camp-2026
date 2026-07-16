from django.urls import path

from .views.student.dashboard import StudentDashboardView

from .views.student.mission import (
    StudentMissionListView,
    StudentMissionDetailView,
)

from .views.student.lesson import (
    LessonDetailView,
)

from .views.student.assignment import (
    StudentAssignmentListView,
    AssignmentSubmitView,
)

from .views.student.submission import (
    SubmissionListView,
    SubmissionGradingView,
)

from .views.student.badge import (
    StudentBadgeListView,
)

from .views.student.xp import (
    StudentXPLogListView,
)

from .views.student.challenge import (
    ChallengeListView,
)

from .views.student.attendance import (
    StudentAttendanceListView,
    AttendanceCheckInView,
)

from .views.parent.dashboard import ParentDashboardView
from .views.parent.student import ParentStudentStatView

from .views.admin.dashboard import AdminDashboardView
from .views.admin.mission import MissionView, MissionDetailView
from .views.admin.lesson import LessonView, LessonDetailView
from .views.admin.assignment import AssignmentView, AssignmentDetailView
from .views.admin.submission import SubmissionView, GradeSubmissionView
from .views.admin.attendance import (
    AttendanceSessionView,
    AttendanceSessionDetailView,
    StudentAttendanceView,
)
from .views.admin.badge import BadgeView, BadgeDetailView
from .views.admin.xp import XPLogView, AwardXPView
from .views.admin.challenge import ChallengeView, ChallengeDetailView

urlpatterns = [

    # Dashboard
    path(
        "dashboard/",
        StudentDashboardView.as_view(),
        name="student-dashboard",
    ),

    # Missions
    path(
        "missions/",
        StudentMissionListView.as_view(),
        name="mission-list",
    ),
    path(
        "missions/<int:pk>/",
        StudentMissionDetailView.as_view(),
        name="mission-detail",
    ),

    # Lessons
    path(
        "lessons/<int:pk>/",
        LessonDetailView.as_view(),
        name="lesson-detail",
    ),

    # Assignments
    path(
        "assignments/",
        StudentAssignmentListView.as_view(),
        name="assignment-list",
    ),
    path(
        "assignments/<int:pk>/submit/",
        AssignmentSubmitView.as_view(),
        name="assignment-submit",
    ),

    # Submissions
    path(
        "submissions/",
        SubmissionListView.as_view(),
        name="submission-list",
    ),
    path(
        "submissions/<int:pk>/grade/",
        SubmissionGradingView.as_view(),
        name="submission-grade",
    ),

    # Badges
    path(
        "badges/",
        StudentBadgeListView.as_view(),
        name="badge-list",
    ),

    # XP
    path(
        "xp/",
        StudentXPLogListView.as_view(),
        name="xp-log-list",
    ),

    # Challenges
    path(
        "challenges/",
        ChallengeListView.as_view(),
        name="challenge-list",
    ),

    # Attendance
    path(
        "attendance/",
        StudentAttendanceListView.as_view(),
        name="attendance-list",
    ),
    path(
        "attendance/check-in/",
        AttendanceCheckInView.as_view(),
        name="attendance-check-in",
    ),



     # ==========================
    # Parent
    # ==========================

    path(
        "parent/dashboard/",
        ParentDashboardView.as_view(),
        name="parent-dashboard",
    ),

    path(
        "parent/students/",
        ParentStudentStatView.as_view(),
        name="parent-students",
    ),

    # ==========================
    # Admin Dashboard
    # ==========================

    path(
        "admin/dashboard/",
        AdminDashboardView.as_view(),
        name="admin-dashboard",
    ),

    # ==========================
    # Missions
    # ==========================

    path(
        "admin/missions/",
        MissionView.as_view(),
        name="admin-missions",
    ),

    path(
        "admin/missions/<int:pk>/",
        MissionDetailView.as_view(),
        name="admin-mission-detail",
    ),

    # ==========================
    # Lessons
    # ==========================

    path(
        "admin/lessons/",
        LessonView.as_view(),
        name="admin-lessons",
    ),

    path(
        "admin/lessons/<int:pk>/",
        LessonDetailView.as_view(),
        name="admin-lesson-detail",
    ),

    # ==========================
    # Assignments
    # ==========================

    path(
        "admin/assignments/",
        AssignmentView.as_view(),
        name="admin-assignments",
    ),

    path(
        "admin/assignments/<int:pk>/",
        AssignmentDetailView.as_view(),
        name="admin-assignment-detail",
    ),

    # ==========================
    # Submissions
    # ==========================

    path(
        "admin/submissions/",
        SubmissionView.as_view(),
        name="admin-submissions",
    ),

    path(
        "admin/submissions/<int:pk>/",
        GradeSubmissionView.as_view(),
        name="admin-grade-submission",
    ),

    # ==========================
    # Attendance
    # ==========================

    path(
        "admin/attendance/",
        StudentAttendanceView.as_view(),
        name="admin-attendance",
    ),

    path(
        "admin/attendance/sessions/",
        AttendanceSessionView.as_view(),
        name="admin-attendance-sessions",
    ),

    path(
        "admin/attendance/sessions/<int:pk>/",
        AttendanceSessionDetailView.as_view(),
        name="admin-attendance-session-detail",
    ),

    # ==========================
    # XP
    # ==========================

    path(
        "admin/xp/",
        XPLogView.as_view(),
        name="admin-xp",
    ),

    path(
        "admin/xp/award/",
        AwardXPView.as_view(),
        name="admin-award-xp",
    ),

    # ==========================
    # Badges
    # ==========================

    path(
        "admin/badges/",
        BadgeView.as_view(),
        name="admin-badges",
    ),

    path(
        "admin/badges/<int:pk>/",
        BadgeDetailView.as_view(),
        name="admin-badge-detail",
    ),

    # ==========================
    # Challenges
    # ==========================

    path(
        "admin/challenges/",
        ChallengeView.as_view(),
        name="admin-challenges",
    ),

    path(
        "admin/challenges/<int:pk>/",
        ChallengeDetailView.as_view(),
        name="admin-challenge-detail",
    ),
]