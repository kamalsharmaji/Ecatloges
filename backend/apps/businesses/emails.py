from django.conf import settings

from apps.notifications.emails import send_email


def send_invitation_email(invitation, token: str) -> None:
    # Transactional: always sent (notification preferences don't apply to invitations).
    send_email(
        "team.invitation",
        to=invitation.email,
        context={
            "business_name": invitation.business.name,
            "role_name": invitation.role.name,
            "inviter_name": invitation.invited_by.full_name if invitation.invited_by else "A team member",
            "accept_url": f"{settings.FRONTEND_URL}/invitations/accept?token={token}",
            # "26 Oct 2026, 10:00" in UTC (same format as the original template's date filter).
            "expires_on": f"{invitation.expires_at.day} {invitation.expires_at:%b %Y, %H:%M}",
        },
    )
