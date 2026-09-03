"""
views/admin/lostgrid.py — new file.

Admin CRUD for the Lost Grid round/question builder. Replaces
AdminMazeObjectListView / AdminMazeObjectDetailView from views/admin/maze.py
— AdminQuestionCatalogView stays in maze.py (now covers both the Challenge
and Quest question banks, see the updated 07_views_admin_maze.py) since
nothing else depends on its location.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import Mission, LostGridRound, LostGridQuestion, AssignmentQuestion
from ...serializers import LostGridRoundSerializer, LostGridQuestionSerializer

# Swap for your project's real admin permission class if it differs from
# plain IsAuthenticated — every other admin view in this codebase presumably
# already gates on an admin-only permission; match that here.
ADMIN_PERMISSIONS = [IsAuthenticated]


class AdminLostGridRoundListView(APIView):
    permission_classes = ADMIN_PERMISSIONS

    def get(self, request, pk):
        mission = Mission.objects.filter(pk=pk).first()
        if not mission:
            return Response({'detail': 'Mission not found.'}, status=404)
        rounds = mission.lostgrid_rounds.all()
        return Response(LostGridRoundSerializer(rounds, many=True).data)

    def post(self, request, pk):
        mission = Mission.objects.filter(pk=pk).first()
        if not mission:
            return Response({'detail': 'Mission not found.'}, status=404)
        serializer = LostGridRoundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(mission=mission)
        return Response(serializer.data, status=201)


class AdminLostGridRoundDetailView(APIView):
    permission_classes = ADMIN_PERMISSIONS

    def patch(self, request, pk):
        round_obj = LostGridRound.objects.filter(pk=pk).first()
        if not round_obj:
            return Response({'detail': 'Round not found.'}, status=404)
        serializer = LostGridRoundSerializer(round_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        round_obj = LostGridRound.objects.filter(pk=pk).first()
        if not round_obj:
            return Response({'detail': 'Round not found.'}, status=404)
        round_obj.delete()
        return Response(status=204)


class AdminLostGridQuestionListView(APIView):
    permission_classes = ADMIN_PERMISSIONS

    def get(self, request, pk):
        round_obj = LostGridRound.objects.filter(pk=pk).first()
        if not round_obj:
            return Response({'detail': 'Round not found.'}, status=404)
        return Response(LostGridQuestionSerializer(round_obj.questions.all(), many=True).data)

    def post(self, request, pk):
        round_obj = LostGridRound.objects.filter(pk=pk).first()
        if not round_obj:
            return Response({'detail': 'Round not found.'}, status=404)

        data = dict(request.data)
        # The bank picker can also surface Quest (AssignmentQuestion)
        # questions — those aren't what `source_question` points to
        # (that FK is ChallengeQuestion-only), so instead of linking live
        # we clone the type/content/points in as an inline question.
        clone_id = data.pop('clone_from_assignment_question', None)
        if clone_id:
            source = AssignmentQuestion.objects.filter(pk=clone_id).first()
            if not source:
                return Response({'detail': 'Quest question not found.'}, status=404)
            if source.question_type == 'project_submission':
                return Response(
                    {'detail': "Project Submission questions can't be copied in from Quests — add them from the Challenge question bank instead."},
                    status=400,
                )
            data['question_type'] = source.question_type
            data['content'] = source.content
            data['points'] = source.points

        serializer = LostGridQuestionSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(round=round_obj)
        return Response(serializer.data, status=201)


class AdminLostGridQuestionDetailView(APIView):
    permission_classes = ADMIN_PERMISSIONS

    def patch(self, request, pk):
        question = LostGridQuestion.objects.filter(pk=pk).first()
        if not question:
            return Response({'detail': 'Question not found.'}, status=404)
        serializer = LostGridQuestionSerializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        question = LostGridQuestion.objects.filter(pk=pk).first()
        if not question:
            return Response({'detail': 'Question not found.'}, status=404)
        question.delete()
        return Response(status=204)