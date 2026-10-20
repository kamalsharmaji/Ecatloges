"""
Single source of truth for business-level permissions and system roles.

Permissions and system roles are synced into the database after every `migrate`
(see apps.rbac.signals). Adding a permission = adding a line here and re-running migrate.

Platform-level privileges (Super Admin / Support Admin) are NOT represented here: they live on
User.platform_role and can never be granted through a business role.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionDef:
    code: str
    name: str
    # Owner-reserved permissions cannot be placed in custom roles or held by non-owner roles.
    assignable: bool = True


def _crud(module: str, label: str, *extra: tuple[str, str]) -> list[PermissionDef]:
    perms = [
        PermissionDef(f"{module}.view", f"View {label}"),
        PermissionDef(f"{module}.create", f"Create {label}"),
        PermissionDef(f"{module}.update", f"Edit {label}"),
        PermissionDef(f"{module}.delete", f"Delete {label}"),
    ]
    perms += [PermissionDef(f"{module}.{action}", name) for action, name in extra]
    return perms


PERMISSIONS: list[PermissionDef] = [
    # Business profile & ownership
    PermissionDef("business.view", "View business profile"),
    PermissionDef("business.update", "Edit business profile"),
    PermissionDef("business.transfer_ownership", "Transfer business ownership", assignable=False),
    # People
    PermissionDef("member.view", "View team members"),
    PermissionDef("member.invite", "Invite team members"),
    PermissionDef("member.manage", "Change member roles, suspend and remove members"),
    PermissionDef("role.view", "View roles"),
    PermissionDef("role.manage", "Create, edit and delete custom roles"),
    # Catalogue content
    *_crud("catalogue", "catalogues", ("publish", "Publish catalogues"), ("export", "Export catalogues")),
    *_crud(
        "product",
        "products",
        ("publish", "Publish products"),
        ("import", "Import products from CSV"),
        ("export", "Export products"),
    ),
    *_crud("category", "categories"),
    PermissionDef("media.view", "View media library"),
    PermissionDef("media.upload", "Upload media"),
    PermissionDef("media.delete", "Delete media"),
    PermissionDef("qrcode.view", "View QR codes"),
    PermissionDef("qrcode.manage", "Create and edit QR codes"),
    # Leads
    PermissionDef("enquiry.view", "View enquiries"),
    PermissionDef("enquiry.update", "Update enquiries"),
    PermissionDef("enquiry.delete", "Delete enquiries"),
    PermissionDef("enquiry.export", "Export enquiries"),
    PermissionDef("customer.view", "View customers"),
    PermissionDef("customer.manage", "Create and edit customers"),
    PermissionDef("customer.export", "Export customers"),
    # Insights
    PermissionDef("analytics.view", "View analytics"),
    PermissionDef("analytics.export", "Export analytics"),
    # Billing & settings
    PermissionDef("subscription.view", "View subscription"),
    PermissionDef("subscription.manage", "Buy, change or cancel the subscription", assignable=False),
    PermissionDef("payment.view", "View payment history"),
    PermissionDef("invoice.view", "View and download invoices"),
    PermissionDef("settings.update", "Update business settings"),
    PermissionDef("support.view", "View support tickets"),
    PermissionDef("support.create", "Create support tickets"),
    PermissionDef("audit_log.view", "View activity log"),
]

PERMISSION_CODES: frozenset[str] = frozenset(p.code for p in PERMISSIONS)
ASSIGNABLE_CODES: frozenset[str] = frozenset(p.code for p in PERMISSIONS if p.assignable)

if len(PERMISSION_CODES) != len(PERMISSIONS):  # pragma: no cover - guards the registry itself
    raise RuntimeError("Duplicate permission code in rbac.registry")


def _codes(*prefixes: str, actions: tuple[str, ...] | None = None) -> set[str]:
    out = set()
    for code in ASSIGNABLE_CODES:
        module, action = code.split(".", 1)
        if module in prefixes and (actions is None or action in actions):
            out.add(code)
    return out


_CONTENT = ("catalogue", "product", "category", "media", "qrcode")
_LEADS = ("enquiry", "customer")
_VIEW = ("view",)

OWNER = "owner"
ADMIN = "admin"


@dataclass(frozen=True)
class SystemRoleDef:
    key: str
    name: str
    description: str
    permissions: frozenset[str]


SYSTEM_ROLES: list[SystemRoleDef] = [
    SystemRoleDef(OWNER, "Business Owner", "Full control, including billing and ownership.", PERMISSION_CODES),
    SystemRoleDef(
        ADMIN,
        "Business Admin",
        "Manages the business, team and all content. Cannot change billing or ownership.",
        ASSIGNABLE_CODES,
    ),
    SystemRoleDef(
        "manager",
        "Manager",
        "Manages catalogues, products, media, enquiries and customers.",
        frozenset(
            _codes(*_CONTENT, *_LEADS, "analytics")
            | {"business.view", "member.view", "role.view", "subscription.view", "support.view", "support.create"}
        ),
    ),
    SystemRoleDef(
        "staff",
        "Staff",
        "Adds and edits content and handles enquiries. Cannot delete, publish or export.",
        frozenset(
            _codes(*_CONTENT, actions=("view", "create", "update", "upload", "manage"))
            | {"enquiry.view", "enquiry.update", "customer.view", "customer.manage", "business.view"}
        ),
    ),
    SystemRoleDef(
        "catalogue_manager",
        "Catalogue Manager",
        "Manages catalogues and their QR codes.",
        frozenset(_codes("catalogue", "qrcode") | {"product.view", "category.view", "media.view", "business.view"}),
    ),
    SystemRoleDef(
        "product_manager",
        "Product Manager",
        "Manages products, categories and media.",
        frozenset(_codes("product", "category", "media") | {"catalogue.view", "business.view"}),
    ),
    SystemRoleDef(
        "enquiry_manager",
        "Enquiry Manager",
        "Handles enquiries and customers.",
        frozenset(_codes(*_LEADS) | {"catalogue.view", "product.view", "business.view"}),
    ),
    SystemRoleDef(
        "viewer",
        "Viewer",
        "Read-only access to business content.",
        frozenset(code for code in ASSIGNABLE_CODES if code.endswith(".view")),
    ),
]
