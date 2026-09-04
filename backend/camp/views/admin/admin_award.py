from rest_framework import generics, permissions, status
from rest_framework.response import Response

from ...models import StudentAward, AWARD_TYPES
from ...serializers import AdminStudentAwardSerializer


class AdminAwardListView(generics.ListCreateAPIView):
    """GET: every award ever assigned (newest first), for the admin awards
    screen. POST: assign a new award — {student: <id>, award_type: <key>}.
    The model's unique_student_award_type constraint is the actual guard
    against assigning the same type twice; we just surface it as a clean
    400 instead of a raw IntegrityError."""
    serializer_class = AdminStudentAwardSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = StudentAward.objects.select_related("student").all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = serializer.validated_data["student"]
        award_type = serializer.validated_data["award_type"]

        if StudentAward.objects.filter(student=student, award_type=award_type).exists():
            return Response(
                {"error": "This student already has that award."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        award = StudentAward.objects.create(student=student, award_type=award_type)
        return Response(AdminStudentAwardSerializer(award).data, status=status.HTTP_201_CREATED)


class AdminAwardDetailView(generics.DestroyAPIView):
    """Revoke an award. Only really makes sense pre-claim, but we don't
    special-case that here — an admin correcting a mistaken assignment
    outranks the claimed flag."""
    queryset = StudentAward.objects.all()
    permission_classes = [permissions.IsAuthenticated]


class AdminAwardTypesView(generics.GenericAPIView):
    """Static lookup for the award-type dropdown in the admin UI, so the
    ten types live in exactly one place (the model) instead of being
    hardcoded a second time in the frontend."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response([{"value": key, "label": label} for key, label in AWARD_TYPES])