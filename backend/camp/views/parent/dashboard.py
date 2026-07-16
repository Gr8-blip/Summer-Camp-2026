from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.models import Family

class ParentDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        try:
            family = Family.objects.get(parent__user=user)
        except Family.DoesNotExist:
            return Response({"error": "No family found for this account"}, status=404)
        

        return Response({
            "family_id": family.id,
            "status": family.status,
            "parent": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name
            },
            "students": [
                {
                    "id": student.id,
                    "full_name": student.full_name,
                    "login_code": student.login_code
                } for student in family.students.all()
            ]
        })