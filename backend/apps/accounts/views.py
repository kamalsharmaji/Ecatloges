from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit_logs import services as audit
from apps.audit_logs.models import AuditScope
from apps.core.exceptions import BusinessRuleViolation

from . import services
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    DetailSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TokenPairResponseSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)


class AuthThrottleMixin:
    """Strict per-client rate limit for credential and token endpoints."""

    throttle_classes = [AnonRateThrottle, UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RegisterSerializer, responses={201: TokenPairResponseSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = services.register_user(
            email=data["email"], password=data["password"], full_name=data["full_name"], phone=data["phone"]
        )
        return Response(
            {**services.issue_tokens(user), "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED
        )


class LoginView(AuthThrottleMixin, TokenObtainPairView):
    serializer_class = LoginSerializer

    @extend_schema(responses=TokenPairResponseSerializer)
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            # Security trail for platform admins only (no IP address, no password, no token).
            user = User.objects.filter(email__iexact=str(request.data.get("email", "")).strip()).first()
            if user is not None:
                audit.record("auth.login", actor=user, scope=AuditScope.ACCOUNT, target=user,
                             target_label=user.full_name or user.email)
        return response


class RefreshView(AuthThrottleMixin, TokenRefreshView):
    """Exchanges a refresh token for a new access token and a NEW refresh token (old one is blacklisted)."""


class LogoutView(AuthThrottleMixin, APIView):
    """Blacklists the given refresh token. Works even when the access token has already expired."""

    permission_classes = [AllowAny]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            token.blacklist()
        except TokenError:
            pass  # Already invalid/expired/blacklisted: the session is over either way.
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(AuthThrottleMixin, APIView):
    @extend_schema(request=ChangePasswordSerializer, responses=TokenPairResponseSerializer)
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tokens = services.change_password(request.user, new_password=serializer.validated_data["new_password"])
        return Response({**tokens, "user": UserSerializer(request.user).data})


class VerifyEmailView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=VerifyEmailSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.verify_email(serializer.validated_data["token"])
        return Response({"email": user.email, "is_email_verified": user.is_email_verified})


class ResendVerificationView(AuthThrottleMixin, APIView):
    @extend_schema(request=None, responses=DetailSerializer)
    def post(self, request):
        if request.user.is_email_verified:
            raise BusinessRuleViolation("Your email address is already verified.", code="already_verified")
        services.send_verification_email(request.user)
        return Response({"detail": "Verification email sent."})


class PasswordResetRequestView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=PasswordResetRequestSerializer, responses=DetailSerializer)
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_reset(serializer.validated_data["email"])
        return Response({"detail": "If an account exists for this email, a reset link has been sent."})


class PasswordResetConfirmView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=PasswordResetConfirmSerializer, responses=DetailSerializer)
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.reset_password(uid=data["uid"], token=data["token"], new_password=data["new_password"])
        return Response({"detail": "Your password has been reset. You can now sign in."})
