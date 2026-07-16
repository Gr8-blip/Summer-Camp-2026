from rest_framework.generics import ListAPIView, CreateAPIView, get_object_or_404
from rest_framework.permissions import IsAuthenticated
from ...models import Assignment
from ...serializers import AssignmentSerializer, SubmissionCreateSerializer


class StudentAssignmentListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.filter(lesson__mission__is_active=True)


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