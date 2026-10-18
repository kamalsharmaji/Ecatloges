from django.conf import settings

from apps.core.emails import send_templated_email


def send_invitation_email(invitation, token: str) -> None:
    send_templated_email(
        to=invitation.email,
        subject=f"You're invited to join {invitation.business.name} on myEcatalogues",
        template="emails/staff_invitation.txt",
        context={
            "business_name": invitation.business.name,
            "role_name": invitation.role.name,
            "inviter_name": invitation.invited_by.full_name if invitation.invited_by else "A team member",
            "accept_url": f"{settings.FRONTEND_URL}/invitations/accept?token={token}",
            "expires_at": invitation.expires_at,
        },
    )
