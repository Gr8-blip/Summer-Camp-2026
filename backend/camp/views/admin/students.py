from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from users.models import Student
from rest_framework.response import Response


class AdminStudentListView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        students = Student.objects.values("id", "full_name")
        return Response(list(students))