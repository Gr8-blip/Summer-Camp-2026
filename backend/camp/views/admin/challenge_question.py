from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import ChallengeQuestion, ChallengeAttempt
from ...serializers import ChallengeQuestionSerializer, ChallengeAttemptSerializer


class ChallengeQuestionListView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeQuestionSerializer

    def get_queryset(self):
        return ChallengeQuestion.objects.filter(challenge_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(challenge_id=self.kwargs['pk'])


class ChallengeQuestionDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeQuestionSerializer
    queryset = ChallengeQuestion.objects.all()


class ChallengeAttemptListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeAttemptSerializer

    def get_queryset(self):
        return ChallengeAttempt.objects.filter(challenge_id=self.kwargs['pk']).select_related('student').order_by('-completed_at')
