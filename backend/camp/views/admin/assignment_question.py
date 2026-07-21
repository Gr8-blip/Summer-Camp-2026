from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import AssignmentQuestion, AssignmentAttempt
from ...serializers import AssignmentQuestionSerializer, AssignmentAttemptSerializer


class AssignmentQuestionListView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentQuestionSerializer

    def get_queryset(self):
        return AssignmentQuestion.objects.filter(assignment_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(assignment_id=self.kwargs['pk'])



class AssignmentQuestionDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentQuestionSerializer
    queryset = AssignmentQuestion.objects.all()


class AssignmentAttemptListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentAttemptSerializer

    def get_queryset(self):
        return AssignmentAttempt.objects.filter(challenge_id=self.kwargs['pk']).select_related('student').order_by('-completed_at')