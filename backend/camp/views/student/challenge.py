from django.db import transaction
from django.db.models import F
from django.db.models import Avg, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from ...models import Challenge, ChallengeAttempt, XPLog
from ...serializers import ChallengeSerializer, StudentChallengeQuestionSerializer, ChallengeAttemptSerializer

def student_for(request):
    return request.user.student

def score_fraction(question, response):
    content = question.content
    qtype = question.question_type
    expected = content.get('answer', content.get('answers'))
 
    if qtype == 'prompt_build':
        return 1.0 if str(response or '').strip() else 0.0
 
    if qtype == 'drag_order':
        items = content.get('items', [])
        if not items or not isinstance(response, list) or len(response) != len(items):
            return 0.0
        matches = sum(1 for a, b in zip(response, items) if a == b)
        return matches / len(items)
 
    if qtype == 'match_pairs':
        pairs = content.get('pairs', content.get('answer', {}))
        if not pairs or not isinstance(response, dict):
            return 0.0
        matched = sum(1 for k, v in pairs.items() if response.get(k) == v)
        return matched / len(pairs)
 
    if qtype == 'memory_tiles':
        return 1.0 if isinstance(response, dict) and response.get('completed') else 0.0
 
    if qtype == 'word_search':
        words = {w.strip().upper() for w in content.get('words', [])}
        found = {str(w).strip().upper() for w in response} if isinstance(response, list) else set()
        if not words:
            return 0.0
        return len(words & found) / len(words)
 
    if qtype == 'image_reveal':
        got = str(response or '').strip().lower()
        want = str(expected or '').strip().lower()
        return 1.0 if got == want else 0.0
 
    if isinstance(expected, bool):
        return 1.0 if (response is expected or str(response).lower() == str(expected).lower()) else 0.0
 
    return 1.0 if response == expected else 0.0


class ChallengeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeSerializer
    def get_queryset(self): return Challenge.objects.filter(is_active=True).order_by('mission__week', 'id')

class ChallengeDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeSerializer
    queryset = Challenge.objects.filter(is_active=True)
    def retrieve(self, request, *args, **kwargs):
        challenge = self.get_object(); data = self.get_serializer(challenge).data
        data['questions'] = StudentChallengeQuestionSerializer(challenge.questions.all(), many=True).data
        data['completed'] = ChallengeAttempt.objects.filter(challenge=challenge, student=student_for(request), completed_at__isnull=False).exists()
        return Response(data)

class ChallengeStartView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, pk):
        challenge = Challenge.objects.filter(pk=pk, is_active=True).first()
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
        return Response(ChallengeAttemptSerializer(attempt).data)

class ChallengeLeaderboardView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, pk):
        attempts = ChallengeAttempt.objects.filter(challenge_id=pk, completed_at__isnull=False).select_related('student').order_by('-score', 'time_taken', '-accuracy')[:10]
        rows = ChallengeAttemptSerializer(attempts, many=True).data
        for index, row in enumerate(rows, 1): row['rank'] = index; row['is_current_student'] = row['student'] == student_for(request).id
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
