from rest_framework.generics import ListAPIView, CreateAPIView, get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from ...models import Assignment
from ...serializers import AssignmentSerializer, SubmissionCreateSerializer
from ...utils.xp import award_xp
from ...utils import achievements

# XP awarded for turning in an assignment. Pull this from a per-assignment
# field instead if one exists on the Assignment model.
ASSIGNMENT_SUBMIT_XP = 20


def _serialize_badges(badges):
    return [{"name": b.name, "icon": b.icon, "rarity": b.rarity} for b in badges]


class StudentAssignmentListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.filter(lesson__mission__is_published=True)


class AssignmentSubmitView(CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionCreateSerializer

    def perform_create(self, serializer):
        assignment = get_object_or_404(
            Assignment,
            pk=self.kwargs["pk"]
        )

        serializer.save(
            assignment=assignment,
            student=self.request.user.student
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)

        student = request.user.student
        award_xp(student, ASSIGNMENT_SUBMIT_XP, "Assignment submitted")

        new_badges = []
        new_badges += achievements.check_submission(student)
        new_badges += achievements.check_coding_cadet(student)
        new_badges += achievements.check_ai_master(student)
        new_badges += achievements.check_xp(student)
        new_badges += achievements.check_legend(student)

        response.data["xp_gained"] = ASSIGNMENT_SUBMIT_XP
        response.data["new_badges"] = _serialize_badges(new_badges)
        return response