from django.db import transaction
from django.db.models import F, Avg, Sum
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
from ...utils.coins import award_coins, award_coins_once, clamp_coins
from ...utils.coin_config import (
    PERFECT_ACCURACY_BONUS,
    FLAWLESS_VICTORY_BONUS,
    LESSON_COMPLETION_BONUS,
    MISSION_COMPLETION_BONUS,
)
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
        if timezone.now() >= assignment.deadline:
            return Response({'detail': 'This quest\'s deadline has passed and it can no longer be started.'}, status=403)
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
        coins_earned = 0
        victory_effect_key = None

        # Every coin award (client-side run bonus + every server-side
        # milestone bonus) gets appended here as {amount, reason} — the
        # frontend queues these one at a time so the student sees exactly
        # WHY each stack of coins landed, not just one opaque total.
        coin_events = []

        if is_complete:
            attempt.completed_at = timezone.now()
            attempt.xp_earned = attempt.assignment.xp_reward

        attempt.save()
        attempt.refresh_from_db()

        if is_complete:
            student = attempt.student
            student.xp = F('xp') + attempt.xp_earned
            student.save(update_fields=['xp'])
            XPLog.objects.create(
                student=student, amount=attempt.xp_earned,
                reason=f'Quest complete: {attempt.assignment.title}'
            )
            student.refresh_from_db(fields=['xp'])

            coins_earned = clamp_coins(request.data.get('coins_earned', 0))
            paid = award_coins(student, coins_earned, reason=f'Quest run: {attempt.assignment.title}')
            if paid:
                coin_events.append({"amount": paid, "reason": f"Quest run: {attempt.assignment.title}"})

            new_badges += achievements.check_quest_completion(student)
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
                    student=student,
                    puzzle_type=q.question_type,
                    defaults={"assignment_question": q}
                )
                if created:
                    newly_completed_puzzle_types.add(q.question_type)
            if newly_completed_puzzle_types:
                new_badges += achievements.check_puzzle(student)
            if "prompt_build" in newly_completed_puzzle_types:
                new_badges += achievements.check_prompt_apprentice(student)
            new_badges += achievements.check_puzzle_master(student)

            # ── Perfect Accuracy / Flawless Victory coin bonuses ──────
            if attempt.accuracy == 100:
                paid = award_coins(
                    student, PERFECT_ACCURACY_BONUS,
                    reason=f'Perfect score: {attempt.assignment.title}'
                )
                if paid:
                    coin_events.append({"amount": paid, "reason": "Perfect score! 🎯"})

                # Flawless Victory stacks on top, only if this was also
                # the student's very first attempt at this quest.
                if attempt.attempt_count == 1:
                    paid = award_coins(
                        student, FLAWLESS_VICTORY_BONUS,
                        reason=f'Flawless victory: {attempt.assignment.title}'
                    )
                    if paid:
                        coin_events.append({"amount": paid, "reason": "Flawless Victory — first try, 100%! ⚡"})
                    new_badges += achievements.check_flawless_victory(student, attempt)

            # ── Lesson completion bonus (once per lesson) ─────────────
            lesson = attempt.assignment.lesson
            if lesson and achievements.lesson_fully_complete(student, lesson):
                paid = award_coins_once(
                    student, LESSON_COMPLETION_BONUS,
                    reason=f'Lesson complete: {lesson.title}'
                )
                if paid:
                    coin_events.append({"amount": paid, "reason": f"Lesson complete: {lesson.title} 📚"})

            # ── Mission completion bonus + badge (once per mission) ───
            mission = lesson.mission if (lesson and lesson.mission_id) else None
            if mission and achievements.mission_fully_complete(student, mission):
                paid = award_coins_once(
                    student, MISSION_COMPLETION_BONUS,
                    reason=f'Mission complete: {mission.title}'
                )
                if paid:
                    coin_events.append({"amount": paid, "reason": f"Mission complete: {mission.title} 🏆"})
                new_badges += achievements.check_mission_completionist(student, mission)

            # Purely cosmetic — frontend plays this before showing the
            # completion screen, same pattern as ChallengeSubmitView.
            victory_effect_key = student.equipped_victory_effect.key if student.equipped_victory_effect_id else None

        data = AssignmentAttemptSerializer(attempt).data
        data['xp_gained'] = attempt.xp_earned if is_complete else 0
        data['coins_gained'] = coins_earned if is_complete else 0
        data['coin_events'] = coin_events
        data['is_complete'] = is_complete
        data['new_badges'] = _serialize_badges(new_badges)
        data['victory_effect_key'] = victory_effect_key if is_complete else None
        return Response(data)


class StudentQuestStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        attempts = AssignmentAttempt.objects.filter(student=student_for(request), completed_at__isnull=False)
        totals = attempts.aggregate(xp=Sum('xp_earned'), avg_attempts=Avg('attempt_count'), total_attempts=Sum('attempt_count'))
        return Response({
            'completed': attempts.count(),
            'xp_earned': totals['xp'] or 0,
            'average_attempts': round(float(totals['avg_attempts'] or 0), 1),
            'total_attempts': totals['total_attempts'] or 0,
            'recent_attempts': AssignmentAttemptSerializer(
                attempts.select_related('assignment', 'assignment__lesson', 'assignment__lesson__mission').order_by('-completed_at')[:6],
                many=True,
            ).data,
        })