"""
Student-facing endpoint for `project_submission` questions.

Sits alongside challenge.py / quest.py (same permission/auth conventions:
IsAuthenticated + student_for(request)). A student can call this as many
times as they like — each call verifies whatever they submitted right now
and stores a fresh ProjectSubmission row. The `id` of that row is what the
student then puts in their final ChallengeSubmitView/QuestSubmitView
`answers[question_id]` payload (as {"submission_id": <id>}) — scoring looks
the row up server-side rather than trusting anything else the client sends
(see utils/scoring.py patch).

URL wiring (add to urls.py, same style as the other camp/ routes):
    path('project-submission/check/', ProjectSubmissionCheckView.as_view()),
"""
import shutil

from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ...models import ChallengeQuestion, AssignmentQuestion, ProjectSubmission
from ...utils.project_verifier import VerifierError, run_checks, safe_extract_zip


def student_for(request):
    return request.user.student


class ProjectSubmissionCheckView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        question_kind = request.data.get("question_kind")  # "challenge" | "assignment"
        question_id = request.data.get("question_id")
        submitted_url = (request.data.get("url") or "").strip()
        zip_file = request.FILES.get("zip")

        if question_kind == "challenge":
            question = ChallengeQuestion.objects.filter(pk=question_id).first()
        elif question_kind == "assignment":
            question = AssignmentQuestion.objects.filter(pk=question_id).first()
        else:
            return Response({"detail": "question_kind must be 'challenge' or 'assignment'."}, status=400)

        if not question or question.question_type != "project_submission":
            return Response({"detail": "Project submission question not found."}, status=404)

        submission_spec = question.content.get("submission", {})
        wants_url = bool(submission_spec.get("url"))
        wants_zip = bool(submission_spec.get("zip"))

        if wants_url and not submitted_url:
            return Response({"detail": "This project requires a URL."}, status=400)
        if wants_zip and not zip_file:
            return Response({"detail": "This project requires a ZIP upload."}, status=400)

        zip_dir = None
        zip_relative_paths = None
        try:
            if zip_file:
                zip_dir, zip_relative_paths = safe_extract_zip(zip_file)

            results, fraction = run_checks(
                question.content,
                zip_dir=zip_dir,
                zip_files=zip_relative_paths,
                url=submitted_url or None,
            )
        except VerifierError as exc:
            return Response({"detail": str(exc)}, status=400)
        finally:
            if zip_dir:
                shutil.rmtree(zip_dir, ignore_errors=True)

        submission = ProjectSubmission(
            student=student_for(request),
            submitted_url=submitted_url,
            results=results,
            score_fraction=round(fraction, 3),
        )
        if question_kind == "challenge":
            submission.challenge_question = question
        else:
            submission.assignment_question = question
        # Re-open the upload for storage — safe_extract_zip only reads it.
        if zip_file:
            zip_file.seek(0)
            submission.submitted_zip = zip_file
        submission.save()

        return Response({
            "submission_id": submission.id,
            "results": results,
            "score_fraction": float(submission.score_fraction),
            "passed_count": sum(1 for r in results if r["passed"]),
            "total_count": len(results),
        })