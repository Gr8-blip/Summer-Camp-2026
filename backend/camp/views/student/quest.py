from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
 
from ...models import Assignment, AssignmentAttempt, XPLog, PuzzleCompletion
from ...serializers import (
    AssignmentSerializer, StudentAssignmentQuestionSerializer, AssignmentAttemptSerializer,
)
from ...utils.scoring import score_fraction
from ...utils.camp import camp_is_started
from ...utils import achievements
from ...utils.achievements import PUZZLE_TYPES
 
 
def student_for(request):
    return request.user.student
 
 
def _serialize_badges(badges):
    return [{"name": b.name, "icon": b.icon, "rarity": b.rarity} for b in badges]
 
 
class QuestDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentSerializer
    queryset = Assignment.objects.filter(is_published=True, lesson__mission__is_published=True)
 
    def retrieve(self, request, *args, **kwargs):
        assignment = self.get_object()
        data = self.get_serializer(assignment).data
        data['questions'] = StudentAssignmentQuestionSerializer(assignment.questions.all(), many=True).data
        attempt = AssignmentAttempt.objects.filter(assignment=assignment, student=student_for(request)).first()
        data['completed'] = bool(attempt and attempt.completed_at)
        data['camp_started'] = camp_is_started()
        return Response(data)
 
 
class QuestStartView(APIView):
    permission_classes = [IsAuthenticated]
 
    def post(self, request, pk):
        if not camp_is_started():
            return Response({'detail': 'Camp has not started yet.'}, status=403)
        assignment = Assignment.objects.filter(pk=pk, is_published=True).first()
        if not assignment:
            return Response({'detail': 'Quest not found.'}, status=404)
        attempt, created = AssignmentAttempt.objects.get_or_create(
            assignment=assignment, student=student_for(request)
        )
        if attempt.completed_at:
            return Response({'detail': 'This quest is already completed.'}, status=409)
        return Response(
            AssignmentAttemptSerializer(attempt).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
 
 
class QuestSubmitView(APIView):
    """
    Unlike Challenges, quests are retryable: if the score isn't 100% the
    attempt just gets its answers/score updated and completed_at stays
    null, so the student can try again. Once fully correct, XP is paid
    and the attempt locks (completed_at set) — same "only once" guarantee
    as Challenge, just without the timer/leaderboard.
    """
    permission_classes = [IsAuthenticated]
 
    @transaction.atomic
    def post(self, request, pk):
        if not camp_is_started():
            return Response({'detail': 'Camp has not started yet.'}, status=403)
 
        attempt = AssignmentAttempt.objects.select_for_update().filter(
            assignment_id=pk, student=student_for(request)
        ).first()
        if not attempt:
            return Response({'detail': 'Start the quest first.'}, status=400)
        if attempt.completed_at:
            return Response({'detail': 'This quest is already completed.'}, status=409)
 
        questions = list(attempt.assignment.questions.all())
        answers = request.data.get('answers', {})
        earned = round(sum(
            q.points * score_fraction(q, answers.get(str(q.id), answers.get(q.id))) for q in questions
        ))
        possible = sum(q.points for q in questions)
        accuracy = round((earned / possible * 100) if possible else 0, 2)
        is_complete = possible == 0 or earned == possible
 
        attempt.score = earned
        attempt.accuracy = accuracy
        attempt.attempt_count = F('attempt_count') + 1
        new_badges = []
 
        if is_complete:
            attempt.completed_at = timezone.now()
            attempt.xp_earned = attempt.assignment.xp_reward
            student = attempt.student
            student.xp = F('xp') + attempt.xp_earned
            student.save(update_fields=['xp'])
            XPLog.objects.create(
                student=student, amount=attempt.xp_earned,
                reason=f'Quest complete: {attempt.assignment.title}'
            )
            student.refresh_from_db(fields=['xp'])
 
            new_badges += achievements.check_submission(student)
            new_badges += achievements.check_coding_cadet(student)
            new_badges += achievements.check_xp(student)
            new_badges += achievements.check_legend(student)
 
            newly_completed_puzzle_types = set()
            for q in questions:
                if q.question_type not in PUZZLE_TYPES:
                    continue
                if score_fraction(q, answers.get(str(q.id), answers.get(q.id))) != 1.0:
                    continue
                _, created = PuzzleCompletion.objects.get_or_create(
                    student=student, puzzle_type=q.question_type, defaults={"question": q},
                )
                if created:
                    newly_completed_puzzle_types.add(q.question_type)
            if newly_completed_puzzle_types:
                new_badges += achievements.check_puzzle(student)
            if "prompt_build" in newly_completed_puzzle_types:
                new_badges += achievements.check_prompt_apprentice(student)
            new_badges += achievements.check_puzzle_master(student)
 
        attempt.save()
        attempt.refresh_from_db()
 
        data = AssignmentAttemptSerializer(attempt).data
        data['xp_gained'] = attempt.xp_earned if is_complete else 0
        data['is_complete'] = is_complete
        data['new_badges'] = _serialize_badges(new_badges)
        return Response(data)