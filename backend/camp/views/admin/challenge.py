from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from ...serializers import ChallengeSerializer
from ...models import Challenge

class ChallengeView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Challenge.objects.all()
    serializer_class = ChallengeSerializer


class ChallengeDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Challenge.objects.all()
    serializer_class = ChallengeSerializer