from django.db import transaction
from django.db.models import F
from django.db.models import Avg, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from ...models import Challenge, ChallengeAttempt, XPLog, PuzzleCompletion, ChallengeWin
from ...serializers import ChallengeSerializer, StudentChallengeQuestionSerializer, ChallengeAttemptSerializer
from ...utils import achievements
from ...utils.achievements import PUZZLE_TYPES
from ...utils.scoring import score_fraction
from ...utils.coins import award_coins, clamp_coins
from ...utils.challenge_finalize import (
    challenge_is_finalized,
    finalize_challenge_if_ready,
    get_ranked_attempts,
)

def student_for(request):
    return request.user.student


def _serialize_badges(badges):
    return [{"name": b.name, "icon": b.icon, "rarity": b.rarity} for b in badges]


class ChallengeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeSerializer

    def get_queryset(self):
        student = student_for(self.request)
        return (
            Challenge.objects
            .filter(
                is_published=True,
                mission__is_published=True,   # only the current (published) mission's challenges
            )
            .exclude(attempts__student=student, attempts__completed_at__isnull=False)  # hide completed
            .order_by('mission__week', 'id')
        )

class ChallengeDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeSerializer
    queryset = Challenge.objects.filter(is_published=True)
    def retrieve(self, request, *args, **kwargs):
        challenge = self.get_object(); data = self.get_serializer(challenge).data
        data['questions'] = StudentChallengeQuestionSerializer(challenge.questions.all(), many=True).data
        data['completed'] = ChallengeAttempt.objects.filter(challenge=challenge, student=student_for(request), completed_at__isnull=False).exists()
        return Response(data)

class ChallengeStartView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, pk):
        challenge = Challenge.objects.filter(pk=pk, is_published=True).first()
        if not challenge: return Response({'detail': 'Challenge not found.'}, status=404)
        now = timezone.now()
        if now < challenge.start_date:
            return Response({'detail': 'This challenge hasn\'t opened yet.'}, status=403)
        if now >= challenge.end_date:
            return Response({'detail': 'This challenge has ended and can no longer be started.'}, status=403)
        attempt, created = ChallengeAttempt.objects.get_or_create(challenge=challenge, student=student_for(request))
        if attempt.completed_at: return Response({'detail': 'This boss battle has already been completed.'}, status=409)
        return Response(ChallengeAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class ChallengeSubmitView(APIView):
    permission_classes = [IsAuthenticated]
    @transaction.atomic
    def post(self, request, pk):
        attempt = ChallengeAttempt.objects.select_for_update().filter(challenge_id=pk, student=student_for(request)).first()
        if not attempt: return Response({'detail': 'Start the challenge first.'}, status=400)
        if attempt.completed_at: return Response({'detail': 'This boss battle has already been completed.'}, status=409)
        questions = list(attempt.challenge.questions.all())
        answers = request.data.get('answers', {})
        earned = round(sum(q.points * score_fraction(q, answers.get(str(q.id), answers.get(q.id))) for q in questions))
        
        possible = sum(q.points for q in questions)
        accuracy = round((earned / possible * 100) if possible else 0, 2)
        seconds = min(int((timezone.now() - attempt.started_at).total_seconds()), attempt.challenge.time_limit)
        attempt.score, attempt.accuracy, attempt.time_taken, attempt.completed_at = earned, accuracy, seconds, timezone.now()
        attempt.xp_earned = round(attempt.challenge.xp_reward * accuracy / 100)
        attempt.save()
        student = attempt.student
        student.xp = F('xp') + attempt.xp_earned; student.save(update_fields=['xp'])
        XPLog.objects.create(student=student, amount=attempt.xp_earned, reason=f'Boss battle: {attempt.challenge.title}')
        student.refresh_from_db(fields=['xp'])

        # Coins are earned by the run itself (however the game shell scored
        # it — speed, no mistakes, potions found, etc.) regardless of final
        # accuracy, since that's a separate, replayable progression track
        # from XP. The classic (non-game) flow just won't send this field,
        # so it defaults to 0 — nothing changes for existing content.
        coins_earned = clamp_coins(request.data.get('coins_earned', 0))
        coin_events = []
        paid = award_coins(student, coins_earned, reason=f'Boss battle run: {attempt.challenge.title}')
        if paid:
            coin_events.append({"amount": paid, "reason": f"Boss battle run: {attempt.challenge.title}"})

        new_badges = []
        new_badges += achievements.check_challenge(student, attempt)

        newly_completed_puzzle_types = set()
        for q in questions:
            if q.question_type not in PUZZLE_TYPES:
                continue
            if score_fraction(q, answers.get(str(q.id), answers.get(q.id))) != 1.0:
                continue
            _, created = PuzzleCompletion.objects.get_or_create(
                student=student,
                puzzle_type=q.question_type,
                defaults={"question": q},
            )
            if created:
                newly_completed_puzzle_types.add(q.question_type)

        if newly_completed_puzzle_types:
            new_badges += achievements.check_puzzle(student)
        if "prompt_build" in newly_completed_puzzle_types:
            new_badges += achievements.check_prompt_apprentice(student)
        new_badges += achievements.check_puzzle_master(student)

        new_badges += achievements.check_xp(student)
        new_badges += achievements.check_legend(student)

        win, finalize_badges = finalize_challenge_if_ready(attempt.challenge)
        if win and win.student_id == student.id and finalize_badges:
            new_badges += finalize_badges

        data = ChallengeAttemptSerializer(attempt).data
        data['xp_gained'] = attempt.xp_earned
        data['coins_gained'] = coins_earned
        data['coin_events'] = coin_events
        data['new_badges'] = _serialize_badges(new_badges)
        # Frontend plays this cosmetic celebration (if equipped) before
        # revealing the completion screen — purely visual, no gameplay effect.
        data['victory_effect_key'] = student.equipped_victory_effect.key if student.equipped_victory_effect_id else None
        return Response(data)

class ChallengeLeaderboardView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, pk):
        challenge = Challenge.objects.filter(pk=pk).first()
        if not challenge:
            return Response({'detail': 'Challenge not found.'}, status=404)


        win, finalize_badges = finalize_challenge_if_ready(challenge)
        is_finalized = challenge_is_finalized(challenge)
        
        ranked = get_ranked_attempts(challenge)[:10]
        rows = ChallengeAttemptSerializer(ranked, many=True).data
        current_student_id = student_for(request).id

        for index, row in enumerate(rows, 1):
            row['rank'] = index
            row['is_current_student'] = row['student'] == current_student_id
            row['is_champion'] = bool(win) and row['student'] == win.student_id

        
        current_student = student_for(request)
        response_data = {
            'is_finalized': is_finalized,
            'current_leader_id': rows[0]['student'] if (rows and not is_finalized) else None,
            'champion_id': win.student_id if win else None,
            'champion_name': win.student.full_name if win else None,
            'results': rows,
        }
        if win and win.student_id == current_student.id and finalize_badges:
            response_data['new_badges'] = _serialize_badges(finalize_badges)

        return Response(response_data)


class StudentChallengeStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        attempts = ChallengeAttempt.objects.filter(student=student_for(request), completed_at__isnull=False)
        totals = attempts.aggregate(score=Sum('score'), xp=Sum('xp_earned'), accuracy=Avg('accuracy'))
        wins = ChallengeWin.objects.filter(student=student_for(request)).count()
        return Response({
            'completed': attempts.count(),
            'score_total': totals['score'] or 0,
            'xp_earned': totals['xp'] or 0,
            'average_accuracy': round(float(totals['accuracy'] or 0), 1),
            'challenges_won': wins,
            'recent_attempts': ChallengeAttemptSerializer(attempts.select_related('challenge').order_by('-completed_at')[:6], many=True).data,
        })