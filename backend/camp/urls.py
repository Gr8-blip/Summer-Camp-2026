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

from .views.student.quest import (
    QuestDetailView,
    QuestStartView,
    QuestSubmitView
)

from .views.student.submission import (
    SubmissionListView,
    SubmissionGradingView,
)

from .views.student.badge import (
    StudentBadgeListView,
    StudentBadgeGridView
)

from .views.student.xp import (
    StudentXPLogListView,
)

from .views.student.challenge import (
    ChallengeListView, ChallengeDetailView as StudentChallengeDetailView, ChallengeStartView, ChallengeSubmitView, ChallengeLeaderboardView, StudentChallengeStatsView,
)

from .views.student.attendance import (
    StudentAttendanceListView,
    AttendanceCheckInView,
)

from .views.parent.dashboard import ParentDashboardView
from .views.parent.student import ParentStudentStatView
from .views.parent.mission import ParentMissionListView
from .views.parent.lesson import ParentLessonListView

from .views.admin.dashboard import AdminDashboardView
from .views.admin.students import AdminStudentListView
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
from .views.admin.challenge import ChallengeView, ChallengeDetailView as AdminChallengeDetailView
from .views.admin.challenge_question import ChallengeQuestionListView, ChallengeQuestionDetailView, ChallengeAttemptListView
from .views.admin.assignment_question import AssignmentQuestionListView, AssignmentQuestionDetailView, AssignmentAttemptListView
from .views.admin.camp_settings import AdminCampSettingsView

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

    path(
        "badges/grid/",
        StudentBadgeGridView.as_view(),
        name='badge-grid'
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
    path("challenges/stats/", StudentChallengeStatsView.as_view(), name="challenge-stats"),
    path("challenges/<int:pk>/", StudentChallengeDetailView.as_view(), name="challenge-detail"),
    path("challenges/<int:pk>/start/", ChallengeStartView.as_view(), name="challenge-start"),
    path("challenges/<int:pk>/submit/", ChallengeSubmitView.as_view(), name="challenge-submit"),
    path("challenges/<int:pk>/leaderboard/", ChallengeLeaderboardView.as_view(), name="challenge-leaderboard"),
    path('quests/<int:pk>/', QuestDetailView.as_view()),
    path('quests/<int:pk>/start/', QuestStartView.as_view()),
    path('quests/<int:pk>/submit/', QuestSubmitView.as_view()),

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

    path(
        "parent/week-scheme/",
        ParentMissionListView.as_view(),
        name="parent-week-scheme"
    ),
    
    path(
        "parent/lessons/",
        ParentLessonListView.as_view(),
        name="parent-lesson"  
    ),

    # ==========================
    # Admin Dashboard
    # ==========================

    path(
        "camp-admin/dashboard/",
        AdminDashboardView.as_view(),
        name="admin-dashboard",
    ),

    # ==========================
    # Admin List Student
    # ==========================
    path(
        "camp-admin/students/",
        AdminStudentListView.as_view(),
        name="students"
    ),

    # ==========================
    # Missions
    # ==========================

    path(
        "camp-admin/missions/",
        MissionView.as_view(),
        name="admin-missions",
    ),

    path(
        "camp-admin/missions/<int:pk>/",
        MissionDetailView.as_view(),
        name="admin-mission-detail",
    ),

    # ==========================
    # Lessons
    # ==========================

    path(
        "camp-admin/lessons/",
        LessonView.as_view(),
        name="admin-lessons",
    ),

    path(
        "camp-admin/lessons/<int:pk>/",
        LessonDetailView.as_view(),
        name="admin-lesson-detail",
    ),

    # ==========================
    # Assignments
    # ==========================

    path(
        "camp-admin/assignments/",
        AssignmentView.as_view(),
        name="admin-assignments",
    ),

    path(
        "camp-admin/assignments/<int:pk>/",
        AssignmentDetailView.as_view(),
        name="admin-assignment-detail",
    ),

    # ==========================
    # Submissions
    # ==========================

    path(
        "camp-admin/submissions/",
        SubmissionView.as_view(),
        name="admin-submissions",
    ),

    path(
        "camp-admin/submissions/<int:pk>/",
        GradeSubmissionView.as_view(),
        name="admin-grade-submission",
    ),

    # ==========================
    # Attendance
    # ==========================

    path(
        "camp-admin/attendance/",
        StudentAttendanceView.as_view(),
        name="admin-attendance",
    ),

    path(
        "camp-admin/attendance/sessions/",
        AttendanceSessionView.as_view(),
        name="admin-attendance-sessions",
    ),

    path(
        "camp-admin/attendance/sessions/<int:pk>/",
        AttendanceSessionDetailView.as_view(),
        name="admin-attendance-session-detail",
    ),

    # ==========================
    # XP
    # ==========================

    path(
        "camp-admin/xp/",
        XPLogView.as_view(),
        name="admin-xp",
    ),

    path(
        "camp-admin/xp/award/",
        AwardXPView.as_view(),
        name="admin-award-xp",
    ),

    # ==========================
    # Badges
    # ==========================

    path(
        "camp-admin/badges/",
        BadgeView.as_view(),
        name="admin-badges",
    ),

    path(
        "camp-admin/badges/<int:pk>/",
        BadgeDetailView.as_view(),
        name="admin-badge-detail",
    ),

    # ==========================
    # Challenges
    # ==========================

    path(
        "camp-admin/challenges/",
        ChallengeView.as_view(),
        name="admin-challenges",
    ),

    path(
        "camp-admin/challenges/<int:pk>/",
        AdminChallengeDetailView.as_view(),
        name="admin-challenge-detail",
    ),
    path("camp-admin/challenges/<int:pk>/questions/", ChallengeQuestionListView.as_view(), name="admin-challenge-questions"),
    path("camp-admin/challenges/<int:pk>/attempts/", ChallengeAttemptListView.as_view(), name="admin-challenge-attempts"),
    path("camp-admin/questions/<int:pk>/", ChallengeQuestionDetailView.as_view(), name="admin-question-detail"),

    path("camp-admin/assignments/<int:pk>/questions/", AssignmentQuestionListView.as_view(), name="admin-assignment-questions"),
    path("camp-admin/assignments/<int:pk>/attempts/", AssignmentAttemptListView.as_view(), name="admin-assignment-attempts"),
    path("camp-admin/assignments/questions/<int:pk>/", AssignmentQuestionDetailView.as_view(), name="admin-assignment-question-detail"),
    

    path("camp-admin/camp-settings/", AdminCampSettingsView.as_view(), name='admin-camp-settings-view'),
]
