from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User
from .platform import platform_permissions


class UserSerializer(serializers.ModelSerializer):
    """The caller's own profile. Never exposes password hashes or tokens."""

    platform_permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "is_email_verified",
            "platform_role",
            "platform_permissions",
            "date_joined",
        ]
        # Email changes need re-verification (later phase); platform_role is set by platform admins only.
        read_only_fields = ["id", "email", "is_email_verified", "platform_role", "date_joined"]

    def get_platform_permissions(self, obj) -> list[str]:
        return sorted(platform_permissions(obj))

    def validate_full_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return value


def _validate_new_password(attrs, user=None, field="new_password"):
    if attrs[field] != attrs[f"{field}_confirm"]:
        raise serializers.ValidationError({f"{field}_confirm": ["Passwords do not match."]})
    try:
        password_validation.validate_password(attrs[field], user=user)
    except Exception as exc:  # django ValidationError
        raise serializers.ValidationError({field: list(exc.messages)}) from None
    return attrs


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    accept_terms = serializers.BooleanField(write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_full_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return value

    def validate_accept_terms(self, value):
        if value is not True:
            raise serializers.ValidationError("You must accept the terms and conditions.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": ["Passwords do not match."]})
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            password_validation.validate_password(attrs["password"], user=candidate)
        except Exception as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from None
        return attrs


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {"no_active_account": "Invalid email or password."}

    def validate(self, attrs):
        attrs[self.username_field] = attrs[self.username_field].strip().lower()
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class TokenPairResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)
    new_password_confirm = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate(self, attrs):
        return _validate_new_password(attrs, user=self.context["request"].user)


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(trim_whitespace=False)
    new_password_confirm = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        return _validate_new_password(attrs)


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
