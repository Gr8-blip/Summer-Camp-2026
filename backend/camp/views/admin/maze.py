from rest_framework.generics import ListCreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import ChallengeQuestion, AssignmentQuestion


def _snippet(content):
    text = content.get('prompt') or content.get('question') or content.get('task') or content.get('instruction') or 'Question'
    return text[:60]


# AdminMazeObjectListView / AdminMazeObjectDetailView are gone — MazeObject
# no longer exists (see 01_models_patch.md). Round/question CRUD for the
# Lost Grid quiz arena now lives in views/admin/lostgrid.py instead.
#
# AdminQuestionCatalogView now covers BOTH question banks — Challenge
# questions AND Quest (AssignmentQuestion) questions — tagged with `kind`
# and `week` so the Lost Grid round builder's picker can show "every
# question that already exists for this week," not just Challenge ones.
# Picking a Quest question doesn't create a live FK (AssignmentQuestion
# isn't what LostGridQuestion.source_question points to) — the round
# builder clones its type/content/points in instead; see
# AdminLostGridQuestionListView.post in views/admin/lostgrid.py.
class AdminQuestionCatalogView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        items = []

        challenge_qs = (
            ChallengeQuestion.objects
            .select_related("challenge", "challenge__mission")
            .order_by("challenge__mission__week", "challenge__title", "order")
        )
        for q in challenge_qs:
            week = q.challenge.mission.week if q.challenge.mission_id else None
            items.append({
                "id": q.id,
                "kind": "challenge",
                "week": week,
                "question_type": q.question_type,
                "label": f"{q.challenge.title} (Challenge) · {q.question_type} · {_snippet(q.content)}",
            })

        assignment_qs = (
            AssignmentQuestion.objects
            .select_related("assignment", "assignment__lesson", "assignment__lesson__mission")
            .order_by("assignment__lesson__mission__week", "assignment__title", "order")
        )
        for q in assignment_qs:
            week = q.assignment.lesson.mission.week
            items.append({
                "id": q.id,
                "kind": "assignment",
                "week": week,
                "question_type": q.question_type,
                "label": f"{q.assignment.title} (Quest) · {q.question_type} · {_snippet(q.content)}",
            })

        items.sort(key=lambda i: (i["week"] is None, i["week"] or 0, i["label"]))
        return Response(items)