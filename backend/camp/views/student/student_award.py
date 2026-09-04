from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ...models import StudentAward, CampSettings
from ...serializers import StudentAwardSerializer, AwardClaimSerializer


class StudentAwardListView(generics.ListAPIView):
    """All awards assigned to the logged-in student, claimed or not.
    Gating on `is_graduation` happens on the frontend (same pattern as the
    certificate lock) — this endpoint just returns what's been assigned so
    the page can render locked cards even a beat before the switch flips."""
    serializer_class = StudentAwardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return StudentAward.objects.filter(student=self.request.user.student)


class StudentAwardClaimView(APIView):
    """POST-only: mark one award claimed. Refuses if graduation isn't live,
    if the award doesn't belong to this student, or if it's already been
    claimed — no duplicate claims, no early reveals via a direct API call."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        AwardClaimSerializer(data=request.data).is_valid(raise_exception=True)

        if not CampSettings.load().is_graduation:
            return Response({"error": "Graduation hasn't started yet."}, status=status.HTTP_403_FORBIDDEN)

        award = StudentAward.objects.filter(pk=pk, student=request.user.student).first()
        if not award:
            return Response({"error": "Award not found."}, status=status.HTTP_404_NOT_FOUND)

        if award.claimed:
            return Response(StudentAwardSerializer(award).data, status=status.HTTP_200_OK)

        award.claimed = True
        award.claimed_at = timezone.now()
        award.save(update_fields=["claimed", "claimed_at"])

        return Response(StudentAwardSerializer(award).data, status=status.HTTP_200_OK)