from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


class AccountUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("email", "full_name")


class AccountUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = AccountUserChangeForm
    add_form = AccountUserCreationForm
    ordering = ("-date_joined",)
    list_display = ("email", "full_name", "platform_role", "is_active", "is_email_verified", "date_joined")
    list_filter = ("platform_role", "is_active", "is_email_verified", "is_staff")
    search_fields = ("email", "full_name", "phone")
    readonly_fields = ("date_joined", "last_login", "email_verified_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("full_name", "phone")}),
        ("Status", {"fields": ("is_active", "is_email_verified", "email_verified_at")}),
        ("Platform access", {"fields": ("platform_role", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("date_joined", "last_login", "updated_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "full_name", "password1", "password2")}),
    )
