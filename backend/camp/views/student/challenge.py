from django.db import transaction
from django.db.models import F
from django.db.models import Avg, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from ...models import Challenge, ChallengeAttempt, XPLog, PuzzleCompletion
from ...serializers import ChallengeSerializer, StudentChallengeQuestionSerializer, ChallengeAttemptSerializer
from ...utils import achievements
from ...utils.achievements import PUZZLE_TYPES
from ...utils.scoring import score_fraction

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

        data = ChallengeAttemptSerializer(attempt).data
        data['xp_gained'] = attempt.xp_earned
        data['new_badges'] = _serialize_badges(new_badges)
        return Response(data)

class ChallengeLeaderboardView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, pk):
        attempts = ChallengeAttempt.objects.filter(challenge_id=pk, completed_at__isnull=False).select_related('student').order_by('-score', 'time_taken', '-accuracy')[:10]
        rows = ChallengeAttemptSerializer(attempts, many=True).data
        for index, row in enumerate(rows, 1): row['rank'] = index; row['is_current_student'] = row['student'] == student_for(request).id
        if rows and rows[0]['is_current_student']:
            achievements.check_hall_of_fame(student_for(request), student_for(request))
            achievements.check_legend(student_for(request))
        return Response(rows)


class StudentChallengeStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        attempts = ChallengeAttempt.objects.filter(student=student_for(request), completed_at__isnull=False)
        totals = attempts.aggregate(score=Sum('score'), xp=Sum('xp_earned'), accuracy=Avg('accuracy'))
        return Response({
            'completed': attempts.count(),
            'score_total': totals['score'] or 0,
            'xp_earned': totals['xp'] or 0,
            'average_accuracy': round(float(totals['accuracy'] or 0), 1),
            'recent_attempts': ChallengeAttemptSerializer(attempts.select_related('challenge').order_by('-completed_at')[:6], many=True).data,
        })