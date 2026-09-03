"""
views/student/game.py — Lost Grid quiz arena (student-facing).

Replaces the old 3D maze move/interact views. No position, no health, no
inventory — a mission's Lost Grid is now an ordered list of rounds, each an
ordered list of questions. The frontend derives "what's next" itself from
`mission.rounds` + `progress.answered_questions`, the same way the old maze
frontend derived "what's at my feet" from `mission.objects` +
`progress.completed_objects` — this view only ever needs to validate and
score one question at a time.
"""
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import Mission, LostGridQuestion, MissionGameProgress, ChallengeQuestion, XPLog
from ...serializers import MissionGameSerializer, MissionGameProgressSerializer, BadgeSerializer
from ...utils.scoring import score_fraction
from ...utils.coins import award_coins
from ...utils.badges_award import award_badge

# Coins earned per XP point on a correctly-answered question, rounded and
# floored at 1 so even a low-point question still pops something. XP itself
# is just the question's `points` value — tune payout by adjusting points
# in the QuizGrid builder rather than touching this file.
QUESTION_COIN_RATIO = 0.3

# Sneaky little XP kicker for hitting a streak milestone — on top of, not
# instead of, the normal per-question payout. Fires every time the streak
# lands exactly on one of these numbers (so it can trigger more than once
# a run if a student breaks and rebuilds a streak).
STREAK_XP_BONUSES = {3: 15, 5: 30, 8: 50, 10: 80}


def _progress(request, mission):
    return MissionGameProgress.objects.get_or_create(student=request.user.student, mission=mission)[0]


def _effective_question(lgq):
    """The thing score_fraction actually needs: `.question_type` /
    `.content`, plus (for project_submission) a real pk it can compare a
    ProjectSubmission's FK against.

    When the round question references the bank, hand back that real,
    saved ChallengeQuestion directly. Otherwise build a transient, UNSAVED
    ChallengeQuestion purely as a duck-typed carrier for scoring — every
    branch of score_fraction() except project_submission only ever reads
    .content/.question_type off it, and inline questions are already
    blocked from being project_submission (see LostGridQuestionSerializer).
    """
    if lgq.source_question_id:
        return lgq.source_question
    return ChallengeQuestion(question_type=lgq.question_type, content=lgq.content, points=lgq.points)


class MissionGameView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        mission = Mission.objects.filter(pk=pk, is_published=True, game_active=True).first()
        if not mission:
            return Response({'detail': 'Lost Grid mission not found.'}, status=404)
        progress = _progress(request, mission)
        return Response({
            'mission': MissionGameSerializer(mission).data,
            'progress': MissionGameProgressSerializer(progress).data,
        })


class MissionGameAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        mission = Mission.objects.filter(pk=pk, is_published=True, game_active=True).first()
        if not mission:
            return Response({'detail': 'Lost Grid mission not found.'}, status=404)

        question_id = request.data.get('question_id')
        lgq = (
            LostGridQuestion.objects
            .select_related('round', 'source_question')
            .filter(pk=question_id, round__mission=mission)
            .first()
        )
        if not lgq:
            return Response({'detail': 'Question not found.'}, status=404)

        progress = MissionGameProgress.objects.select_for_update().get_or_create(
            student=request.user.student, mission=mission
        )[0]

        # Idempotent: replaying/refreshing on an already-answered question
        # never re-scores or re-pays it, same guard `completed_objects` gave
        # the old maze.
        if lgq.id in progress.answered_questions:
            return Response({
                'correct': True,
                'already_answered': True,
                'xp_gained': 0,
                'coins_gained': 0,
                'round_completed': None,
                'mission_completed': bool(progress.completed_at),
                'new_badges': [],
                'streak': progress.current_streak,
                'streak_bonus_xp': 0,
                'progress': MissionGameProgressSerializer(progress).data,
            })

        student = request.user.student
        answer = request.data.get('answer')
        timed_out = bool(request.data.get('timed_out'))
        if timed_out:
            # Ran out of the per-question time limit — always wrong, and
            # never touches score_fraction (its per-type comparisons
            # expect a real answer shape, not a timeout sentinel).
            fraction = 0
        else:
            fraction = score_fraction(_effective_question(lgq), answer, student=student)
        correct = fraction >= 1

        progress.answered_questions = list(progress.answered_questions) + [lgq.id]
        progress.answered_count = F('answered_count') + 1
        if correct:
            progress.correct_count = F('correct_count') + 1
        progress.save(update_fields=['answered_questions', 'answered_count', 'correct_count'])
        progress.refresh_from_db(fields=['answered_count', 'correct_count'])

        xp_gain, coin_gain = 0, 0
        round_completed = None
        new_badges = []
        streak_bonus_xp = 0

        # Per-question payout — happens the instant a question is answered
        # correctly, not held until the round finishes, so the frontend can
        # pop XP/coin feedback on every single question. A wrong answer (or
        # a timeout, which is forced wrong above) never reaches this block.
        if correct and lgq.points:
            q_xp = lgq.points
            q_coins = max(1, round(lgq.points * QUESTION_COIN_RATIO))
            student.xp = F('xp') + q_xp
            student.save(update_fields=['xp'])
            XPLog.objects.create(student=student, amount=q_xp, reason=f'Lost Grid question: {lgq.round.title}')
            xp_gain += q_xp
            paid = award_coins(student, q_coins, f'Lost Grid question: {lgq.round.title}')
            coin_gain += paid or 0

        # Streak tracking — lives on progress so it persists across rounds
        # for the whole run. A wrong/timed-out answer breaks it; a correct
        # one extends it and can trigger a streak badge or a sneaky little
        # XP bonus for hitting a round-number milestone.
        prior_streak = progress.current_streak
        if correct:
            progress.current_streak = prior_streak + 1
            # "Comeback Kid" — this correct answer is the first one after a
            # wrong/timed-out answer, and it's not just their very first
            # answer of the run (had_miss gates that).
            if prior_streak == 0 and progress.had_miss:
                awarded = award_badge(student, "Comeback Kid")
                if awarded:
                    new_badges.append(awarded)
            if progress.current_streak == 3:
                awarded = award_badge(student, "Bullseye")
                if awarded:
                    new_badges.append(awarded)
            if progress.current_streak == 5:
                awarded = award_badge(student, "On Fire")
                if awarded:
                    new_badges.append(awarded)
            bonus = STREAK_XP_BONUSES.get(progress.current_streak)
            if bonus:
                student.xp = F('xp') + bonus
                student.save(update_fields=['xp'])
                XPLog.objects.create(student=student, amount=bonus, reason=f'QuizGrid streak x{progress.current_streak}')
                xp_gain += bonus
                streak_bonus_xp = bonus
        else:
            progress.current_streak = 0
            progress.had_miss = True
        progress.save(update_fields=['current_streak', 'had_miss'])

        round_obj = lgq.round
        round_question_ids = set(round_obj.questions.values_list('id', flat=True))
        round_done = round_question_ids.issubset(set(progress.answered_questions))

        if round_done and round_obj.id not in progress.completed_rounds:
            progress.completed_rounds = list(progress.completed_rounds) + [round_obj.id]
            if round_obj.xp_reward:
                student.xp = F('xp') + round_obj.xp_reward
                student.save(update_fields=['xp'])
                XPLog.objects.create(student=student, amount=round_obj.xp_reward, reason=f'Lost Grid round: {round_obj.title}')
                xp_gain += round_obj.xp_reward
            if round_obj.coin_reward:
                paid = award_coins(student, round_obj.coin_reward, f'Lost Grid round: {round_obj.title}')
                coin_gain += paid or 0
            round_completed = {'id': round_obj.id, 'title': round_obj.title, 'xp': round_obj.xp_reward, 'coins': round_obj.coin_reward}

            # Mission complete once its LAST round (by order) is done.
            last_round = mission.lostgrid_rounds.order_by('-order', '-id').first()
            if last_round and last_round.id == round_obj.id and not progress.completed_at:
                progress.completed_at = timezone.now()
                if mission.xp_reward:
                    student.xp = F('xp') + mission.xp_reward
                    student.save(update_fields=['xp'])
                    XPLog.objects.create(student=student, amount=mission.xp_reward, reason=f'Lost Grid complete: {mission.title}')
                    xp_gain += mission.xp_reward
                if mission.coin_reward:
                    paid = award_coins(student, mission.coin_reward, f'Lost Grid complete: {mission.title}')
                    coin_gain += paid or 0

                # Whole-run badges — only evaluated once, right as the
                # mission's last round is cleared, using the final
                # answered/correct counts for this run.
                if progress.answered_count and progress.correct_count / progress.answered_count >= 0.8:
                    awarded = award_badge(student, "Sharpshooter")
                    if awarded:
                        new_badges.append(awarded)
                if progress.answered_count and progress.correct_count == progress.answered_count:
                    awarded = award_badge(student, "QuizGrid Legend")
                    if awarded:
                        new_badges.append(awarded)

        progress.xp = F('xp') + xp_gain
        progress.coins = F('coins') + coin_gain
        progress.save()
        progress.refresh_from_db()
        student.refresh_from_db(fields=['xp', 'coins'])

        # XP-threshold badges — checked against this run's total, so they
        # can fire on whichever question happens to push it over the line.
        if progress.xp >= 1000:
            awarded = award_badge(student, "XP Hoarder")
            if awarded:
                new_badges.append(awarded)
        if progress.xp >= 2000:
            awarded = award_badge(student, "XP Overlord")
            if awarded:
                new_badges.append(awarded)

        return Response({
            'correct': correct,
            'fraction': fraction,
            'timed_out': timed_out,
            'xp_gained': xp_gain,
            'coins_gained': coin_gain,
            'round_completed': round_completed,
            'mission_completed': bool(progress.completed_at),
            'new_badges': BadgeSerializer(new_badges, many=True).data,
            'streak': progress.current_streak,
            'streak_bonus_xp': streak_bonus_xp,
            'progress': MissionGameProgressSerializer(progress).data,
        })