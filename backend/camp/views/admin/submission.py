from rest_framework.generics import RetrieveUpdateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated

from ...models import Submission
from ...serializers import SubmissionUpdateSerializer, SubmissionListSerializer
from ...utils.xp import award_xp


class SubmissionView(ListAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Submission.objects.all()
    serializer_class = SubmissionListSerializer

class GradeSubmissionView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Submission.objects.select_related(
        "student",
        "assignment"
    )
    serializer_class = SubmissionUpdateSerializer

    def perform_update(self, serializer):
        submission = self.get_object()

        was_graded = submission.status == "graded"

        submission = serializer.save()
