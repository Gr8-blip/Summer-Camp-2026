from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags


def send_payment_confirmation_email(family, payment):
    """
    Sends a payment confirmation email after a successful Paystack payment.
    """

    parent = family.parent.user

    subject = "🎉 Your Summer Tech Bootcamp Registration is Confirmed!"

    context = {
        "parent_name": parent.first_name,
        "payment_amount": payment.amount,
        "payment_reference": payment.paystack_ref,
        "students": family.students.all(),
    }

    html_content = render_to_string(
        "emails/payment_confirmation.html",
        context,
    )

    # Plain text fallback for email clients that don't render HTML
    text_content = strip_tags(html_content)

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[parent.email],
    )

    email.attach_alternative(html_content, "text/html")

    result = email.send(fail_silently=False)