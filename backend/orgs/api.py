import logging
import mimetypes
from datetime import datetime, timezone

import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GuideService, ServiceStripeAccount
from .permissions import IsServiceOwnerOrManager
from .serializers import (
    GuideServiceSerializer,
    StripeAccountStatusSerializer,
    StripeOnboardingLinkSerializer,
)

logger = logging.getLogger(__name__)


def configure_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured.")
    stripe.api_key = settings.STRIPE_SECRET_KEY


def sync_account_from_stripe(
    local_account: ServiceStripeAccount, stripe_account: stripe.Account
) -> None:
    changed_fields: list[str] = []
    field_mapping = {
        "livemode": "livemode",
        "charges_enabled": "charges_enabled",
        "payouts_enabled": "payouts_enabled",
        "details_submitted": "details_submitted",
    }
    for field, attr in field_mapping.items():
        value = bool(getattr(stripe_account, attr, False))
        if getattr(local_account, field) != value:
            setattr(local_account, field, value)
            changed_fields.append(field)

    default_currency = getattr(stripe_account, "default_currency", "") or ""
    if local_account.default_currency != default_currency:
        local_account.default_currency = default_currency
        changed_fields.append("default_currency")

    email = getattr(stripe_account, "email", "") or ""
    if local_account.account_email != email:
        local_account.account_email = email
        changed_fields.append("account_email")

    if changed_fields:
        changed_fields.append("updated_at")
        local_account.save(update_fields=changed_fields)


class GuideServiceBaseView(APIView):
    permission_classes = [IsAuthenticated, IsServiceOwnerOrManager]
    guide_service: GuideService | None = None

    def dispatch(self, request, *args, **kwargs):
        service_id = kwargs.get("service_id")
        self.guide_service = get_object_or_404(GuideService, pk=service_id)
        return super().dispatch(request, *args, **kwargs)


class GuideServiceStripeBaseView(GuideServiceBaseView):
    def get_account(self) -> ServiceStripeAccount | None:
        try:
            return self.guide_service.stripe_account  # type: ignore[attr-defined]
        except ServiceStripeAccount.DoesNotExist:
            return None


class StripeOnboardingLinkView(GuideServiceStripeBaseView):
    """
    Create (or refresh) an onboarding link for the guide service's Stripe Express account.
    """

    def post(self, request, service_id, *args, **kwargs):
        try:
            configure_stripe()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        if not settings.STRIPE_CONNECT_RETURN_URL or not settings.STRIPE_CONNECT_REFRESH_URL:
            return Response(
                {
                    "detail": "Stripe connect return/refresh URLs are not configured. "
                    "Set STRIPE_CONNECT_RETURN_URL and STRIPE_CONNECT_REFRESH_URL."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        account = self.get_account()
        try:
            if account is None:
                stripe_account = stripe.Account.create(
                    type="express",
                    email=self.guide_service.contact_email or None,
                )
                account = ServiceStripeAccount.objects.create(
                    guide_service=self.guide_service,
                    account_id=stripe_account.id,
                    livemode=stripe_account.livemode,
                    charges_enabled=stripe_account.charges_enabled,
                    payouts_enabled=stripe_account.payouts_enabled,
                    details_submitted=stripe_account.details_submitted,
                    default_currency=stripe_account.default_currency or "",
                    account_email=stripe_account.email or "",
                    created_by=request.user,
                )
                self.guide_service.billing_stripe_account = stripe_account.id
                self.guide_service.save(update_fields=["billing_stripe_account"])
            else:
                stripe_account = stripe.Account.retrieve(account.account_id)
                sync_account_from_stripe(account, stripe_account)

            link = stripe.AccountLink.create(
                account=account.account_id,
                type="account_onboarding",
                refresh_url=settings.STRIPE_CONNECT_REFRESH_URL,
                return_url=settings.STRIPE_CONNECT_RETURN_URL,
            )

        except stripe.error.StripeError as exc:
            logger.exception("Failed to create Stripe onboarding link: %s", exc)
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        expires_at = datetime.fromtimestamp(link.expires_at, tz=timezone.utc)
        account.onboarding_link_url = link.url
        account.onboarding_expires_at = expires_at
        account.save(update_fields=["onboarding_link_url", "onboarding_expires_at", "updated_at"])

        serializer = StripeOnboardingLinkSerializer(
            {"url": link.url, "expires_at": expires_at}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StripeAccountStatusView(GuideServiceStripeBaseView):
    """Return the current connection status for the guide service Stripe account."""

    def get(self, request, service_id, *args, **kwargs):
        try:
            configure_stripe()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        account = self.get_account()
        if account:
            try:
                stripe_account = stripe.Account.retrieve(account.account_id)
                sync_account_from_stripe(account, stripe_account)
                try:
                    login_link = stripe.Account.create_login_link(account.account_id)
                    account.express_dashboard_url = login_link.url
                    account.save(update_fields=["express_dashboard_url", "updated_at"])
                except stripe.error.StripeError as exc:
                    logger.warning(
                        "Unable to create Stripe login link for account %s: %s",
                        account.account_id,
                        exc,
                    )
            except stripe.error.StripeError as exc:
                logger.exception("Failed to refresh Stripe account status: %s", exc)

        payload = StripeAccountStatusSerializer.from_account(account)
        return Response(payload)


class StripeDisconnectView(GuideServiceStripeBaseView):
    """Disconnect the Stripe account and remove local credentials."""

    def post(self, request, service_id, *args, **kwargs):
        try:
            configure_stripe()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        account = self.get_account()
        if account is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        try:
            stripe.Account.delete(account.account_id)
        except stripe.error.StripeError as exc:
            logger.exception("Failed to disconnect Stripe account: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        account.delete()
        self.guide_service.billing_stripe_account = ""
        self.guide_service.save(update_fields=["billing_stripe_account"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class StripeWebhookView(APIView):
    """Receive Stripe webhook events (Connect)."""

    permission_classes: list = []
    authentication_classes: list = []

    def post(self, request, *args, **kwargs):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
        if not settings.STRIPE_WEBHOOK_SECRET:
            logger.error("Stripe webhook secret not configured.")
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            logger.warning("Invalid payload received on Stripe webhook.")
            return Response(status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.SignatureVerificationError:
            logger.warning("Invalid Stripe signature.")
            return Response(status=status.HTTP_400_BAD_REQUEST)

        data_object = event["data"]["object"]
        account_id = data_object.get("id") or event.get("account")

        try:
            configure_stripe()
        except RuntimeError as exc:
            logger.error("Stripe secret not configured: %s", exc)
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if account_id:
            try:
                account = ServiceStripeAccount.objects.get(account_id=account_id)
            except ServiceStripeAccount.DoesNotExist:
                account = None
        else:
            account = None

        if event["type"] in {"account.updated", "account.external_account.created", "account.external_account.deleted"}:
            if account:
                try:
                    stripe_account = stripe.Account.retrieve(account.account_id)
                    sync_account_from_stripe(account, stripe_account)
                    account.last_webhook_received_at = datetime.now(tz=timezone.utc)
                    account.last_webhook_error_at = None
                    account.last_webhook_error_message = ""
                    account.save(
                        update_fields=[
                            "last_webhook_received_at",
                            "last_webhook_error_at",
                            "last_webhook_error_message",
                            "updated_at",
                        ]
                    )
                except stripe.error.StripeError as exc:
                    logger.exception("Error syncing Stripe account from webhook: %s", exc)
                    if account:
                        account.last_webhook_error_at = datetime.now(tz=timezone.utc)
                        account.last_webhook_error_message = str(exc)
                        account.save(
                            update_fields=[
                                "last_webhook_error_at",
                                "last_webhook_error_message",
                                "updated_at",
                            ]
                        )
        elif event["type"] == "account.application.deauthorized":
            if account:
                account.delete()
        else:
            # store heartbeat that webhook reached us even if we do not act
            if account:
                account.last_webhook_received_at = datetime.now(tz=timezone.utc)
                account.last_webhook_error_at = None
                account.last_webhook_error_message = ""
                account.save(
                    update_fields=[
                        "last_webhook_received_at",
                        "last_webhook_error_at",
                        "last_webhook_error_message",
                        "updated_at",
                    ]
                )

        return Response(status=status.HTTP_200_OK)


class GuideServiceDetailView(GuideServiceBaseView):
    """Return branding/settings information for a guide service."""

    def get(self, request, service_id, *args, **kwargs):
        serializer = GuideServiceSerializer(
            self.guide_service, context={"request": request}
        )
        return Response(serializer.data)


class GuideServiceLogoView(GuideServiceBaseView):
    """Upload or delete a guide service logo."""

    parser_classes = [MultiPartParser, FormParser]
    MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
    ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/svg+xml"}

    def post(self, request, service_id, *args, **kwargs):
        logo_file = request.FILES.get("logo")
        if logo_file is None:
            return Response({"detail": "logo file is required."}, status=status.HTTP_400_BAD_REQUEST)

        if logo_file.size > self.MAX_FILE_BYTES:
            return Response(
                {"detail": "Logo must be 2 MB or smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = logo_file.content_type or mimetypes.guess_type(logo_file.name)[0]
        if content_type not in self.ALLOWED_CONTENT_TYPES:
            return Response(
                {"detail": "Unsupported file type. Upload PNG, JPEG, or SVG."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_logo = getattr(self.guide_service, "logo", None)
        if existing_logo:
            existing_logo.delete(save=False)

        self.guide_service.logo = logo_file
        self.guide_service.save(update_fields=["logo"])

        serializer = GuideServiceSerializer(
            self.guide_service, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, service_id, *args, **kwargs):
        if self.guide_service.logo:
            self.guide_service.logo.delete(save=False)
            self.guide_service.logo = None
            self.guide_service.save(update_fields=["logo"])
        return Response(status=status.HTTP_204_NO_CONTENT)
