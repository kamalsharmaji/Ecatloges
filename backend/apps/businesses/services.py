"""
Business, membership and invitation workflows.

All authorization rules that go beyond "does the caller hold permission X" live here so that
every entry point (API views, admin actions, future management commands) enforces them the same way.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import exceptions

from apps.core.exceptions import BusinessRuleViolation
from apps.rbac.models import Role
from apps.rbac.registry import ADMIN, OWNER

from .context import BusinessContext
from .emails import send_invitation_email
from .models import Business, BusinessMembership, StaffInvitation

logger = logging.getLogger("apps.businesses")

INVITATION_TTL = timedelta(days=7)


def system_role(key: str) -> Role:
    return Role.objects.get(key=key, business__isnull=True)


def _rule(message: str, code: str) -> BusinessRuleViolation:
    return BusinessRuleViolation(message, code=code)


# ---------------------------------------------------------------------------
# Businesses
# ---------------------------------------------------------------------------
def _unique_slug(name: str) -> str:
    base = slugify(name)[:60] or "business"
    slug, n = base, 2
    while Business.objects.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


@transaction.atomic
def create_business(*, user, **fields) -> Business:
    """Create a business and make `user` its owner, atomically."""
    owned = BusinessMembership.objects.filter(user=user, role__key=OWNER, role__business__isnull=True).count()
    if owned >= settings.MAX_BUSINESSES_PER_USER:
        raise _rule(
            f"You can own at most {settings.MAX_BUSINESSES_PER_USER} businesses.", "business_limit_reached"
        )
    for attempt in range(3):
        try:
            with transaction.atomic():
                business = Business.objects.create(slug=_unique_slug(fields["name"]), created_by=user, **fields)
            break
        except IntegrityError:  # concurrent slug collision — retry with a fresh suffix
            if attempt == 2:
                raise
    BusinessMembership.objects.create(business=business, user=user, role=system_role(OWNER))
    logger.info("Business created", extra={"business_id": str(business.id), "user_id": str(user.id)})
    return business


# ---------------------------------------------------------------------------
# Role assignment guards
# ---------------------------------------------------------------------------
def assert_can_assign_role(ctx: BusinessContext, role: Role) -> None:
    """A member may only hand out roles whose permissions they hold themselves."""
    if not role.is_system and role.business_id != ctx.business.id:
        raise exceptions.ValidationError({"role": ["Select a valid role."]})
    if role.is_owner_role and not ctx.is_owner:
        raise exceptions.PermissionDenied("Only a business owner can grant the owner role.")
    missing = role.permission_codes() - ctx.permissions
    if missing:
        raise exceptions.PermissionDenied("You cannot grant permissions that you do not hold yourself.")


def _lock_active_owners(business: Business) -> list[BusinessMembership]:
    """Lock owner memberships so concurrent demotions can't remove the last owner."""
    return list(
        BusinessMembership.objects.select_for_update()
        .filter(business=business, status=BusinessMembership.Status.ACTIVE, role__key=OWNER, role__business__isnull=True)
        .order_by("id")
    )


def _assert_not_last_owner(target: BusinessMembership) -> None:
    owners = _lock_active_owners(target.business)
    if target.is_owner and target.is_active and len(owners) <= 1:
        raise _rule(
            "A business must keep at least one active owner. Transfer ownership first.", "last_owner"
        )


def _assert_can_manage(ctx: BusinessContext, target: BusinessMembership) -> None:
    if target.pk == ctx.membership.pk:
        raise exceptions.PermissionDenied("You cannot change your own role or membership status.")
    if target.is_owner and not ctx.is_owner:
        raise exceptions.PermissionDenied("Only a business owner can change another owner's membership.")


# ---------------------------------------------------------------------------
# Memberships
# ---------------------------------------------------------------------------
@transaction.atomic
def update_membership(ctx: BusinessContext, target: BusinessMembership, *, role=None, status=None):
    target = BusinessMembership.objects.select_for_update().select_related("role", "business").get(pk=target.pk)
    _assert_can_manage(ctx, target)

    losing_ownership = target.is_owner and (
        (role is not None and not role.is_owner_role) or status == BusinessMembership.Status.SUSPENDED
    )
    if losing_ownership:
        _assert_not_last_owner(target)
    if role is not None and role.pk != target.role_id:
        assert_can_assign_role(ctx, role)
        target.role = role
    if status is not None:
        target.status = status
    target.save()
    logger.info(
        "Membership updated",
        extra={"membership_id": str(target.id), "actor_id": str(ctx.membership.user_id), "role": target.role.name,
               "status": target.status},
    )
    return target


@transaction.atomic
def remove_membership(ctx: BusinessContext, target: BusinessMembership) -> None:
    target = BusinessMembership.objects.select_for_update().select_related("role", "business").get(pk=target.pk)
    _assert_can_manage(ctx, target)
    _assert_not_last_owner(target)
    logger.info("Membership removed", extra={"membership_id": str(target.id), "actor_id": str(ctx.membership.user_id)})
    target.delete()


@transaction.atomic
def leave_business(ctx: BusinessContext) -> None:
    membership = BusinessMembership.objects.select_for_update().select_related("role", "business").get(
        pk=ctx.membership.pk
    )
    _assert_not_last_owner(membership)
    membership.delete()


@transaction.atomic
def transfer_ownership(ctx: BusinessContext, target: BusinessMembership) -> BusinessMembership:
    """Make `target` an owner and step the current owner down to Business Admin."""
    if not ctx.is_owner:
        raise exceptions.PermissionDenied("Only a business owner can transfer ownership.")
    target = BusinessMembership.objects.select_for_update().select_related("role").get(pk=target.pk)
    if target.pk == ctx.membership.pk:
        raise exceptions.ValidationError({"membership": ["You already own this business."]})
    if not target.is_active:
        raise _rule("Ownership can only be transferred to an active member.", "inactive_member")
    actor = BusinessMembership.objects.select_for_update().get(pk=ctx.membership.pk)
    target.role = system_role(OWNER)
    target.save(update_fields=["role", "updated_at"])
    actor.role = system_role(ADMIN)
    actor.save(update_fields=["role", "updated_at"])
    logger.info("Ownership transferred", extra={"business_id": str(ctx.business.id), "to_membership": str(target.id)})
    return target


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------
@transaction.atomic
def invite_member(ctx: BusinessContext, *, email: str, role: Role) -> StaffInvitation:
    email = email.strip().lower()
    assert_can_assign_role(ctx, role)
    if BusinessMembership.objects.filter(business=ctx.business, user__email__iexact=email).exists():
        raise _rule("This person is already a member of the business.", "already_member")
    if StaffInvitation.objects.filter(
        business=ctx.business, email=email, status=StaffInvitation.Status.PENDING, expires_at__gt=timezone.now()
    ).exists():
        raise _rule("An invitation is already pending for this email address.", "invitation_pending")
    # Expired pending invitations would block the partial unique constraint; retire them.
    StaffInvitation.objects.filter(
        business=ctx.business, email=email, status=StaffInvitation.Status.PENDING
    ).update(status=StaffInvitation.Status.REVOKED)

    token = StaffInvitation.generate_token()
    invitation = StaffInvitation.objects.create(
        business=ctx.business,
        email=email,
        role=role,
        token_hash=StaffInvitation.hash_token(token),
        invited_by=ctx.membership.user,
        expires_at=timezone.now() + INVITATION_TTL,
    )
    transaction.on_commit(lambda: send_invitation_email(invitation, token))
    return invitation


def revoke_invitation(invitation: StaffInvitation) -> None:
    if invitation.status != StaffInvitation.Status.PENDING:
        raise _rule("Only pending invitations can be revoked.", "invitation_not_pending")
    invitation.status = StaffInvitation.Status.REVOKED
    invitation.save(update_fields=["status", "updated_at"])


@transaction.atomic
def accept_invitation(*, user, token: str) -> BusinessMembership:
    invitation = (
        StaffInvitation.objects.select_for_update()
        .select_related("business", "role")
        .filter(token_hash=StaffInvitation.hash_token(token or ""))
        .first()
    )
    if invitation is None or invitation.status != StaffInvitation.Status.PENDING:
        raise exceptions.NotFound("This invitation is invalid or has already been used.")
    if invitation.is_expired:
        raise _rule("This invitation has expired. Ask the business to send a new one.", "invitation_expired")
    if invitation.email != user.email:
        raise exceptions.PermissionDenied("This invitation was sent to a different email address.")
    if invitation.business.status != Business.Status.ACTIVE:
        raise exceptions.NotFound("This invitation is invalid or has already been used.")
    if BusinessMembership.objects.filter(business=invitation.business, user=user).exists():
        raise _rule("You are already a member of this business.", "already_member")

    membership = BusinessMembership.objects.create(
        business=invitation.business, user=user, role=invitation.role, invited_by=invitation.invited_by
    )
    invitation.status = StaffInvitation.Status.ACCEPTED
    invitation.accepted_by = user
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["status", "accepted_by", "accepted_at", "updated_at"])
    # Possession of the emailed token proves control of the address.
    if not user.is_email_verified:
        user.mark_email_verified()
    return membership
