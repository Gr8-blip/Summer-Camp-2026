from rest_framework.generics import ListAPIView, UpdateAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Submission
from ...serializers import SubmissionListSerializer, SubmissionUpdateSerializer


class SubmissionListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionListSerializer

    def get_queryset(self):
        return Submission.objects.filter(student=self.request.user.student).order_by('-submitted_at')


# Grading submissions

class SubmissionGradingView(UpdateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Submission.objects.all()
    serializer_class = SubmissionUpdateSerializer