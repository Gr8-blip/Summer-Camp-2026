from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ...serializers import StudentCampSettingsSerializer
from ...models import CampSettings


class StudentCampSettingsView(APIView):
    """Read-only camp status for students — { camp_started, is_graduation }.
    Mirrors AdminCampSettingsView but GET-only and via the trimmed
    StudentCampSettingsSerializer, so nothing admin-only leaks here."""
    permission_classes = [IsAuthenticated]  # swap for your student permission class

    def get(self, request):
        return Response(StudentCampSettingsSerializer(CampSettings.load()).data)