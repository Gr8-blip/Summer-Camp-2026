from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.models import Family
from ...models import Lesson

class ParentStudentStatView(APIView):
    permission_classes = [IsAuthenticated]
    

    def get(self, request):
        user = request.user

        try:
            family = Family.objects.get(parent__user=user)
        except:
            return Response({"error": "No family found for this account"}, status=404)
        
        students = []

        total_lessons = Lesson.objects.count()

        for student in family.students.all():
            attended = student.attendances.count()

            attendance = (
                round((attended / total_lessons) * 100)
                if total_lessons
                else 0
            )

            students.append({
                "id": student.id,
                "name": student.full_name,
                "xp": student.xp,
                "badge_count": student.badges.count(),  
                "attendance": attendance,
            })

        return Response({"students": students})