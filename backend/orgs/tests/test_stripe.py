from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from orgs.models import GuideService, ServiceStripeAccount


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="examplepass",
        first_name="Owner",
        last_name="Person",
    )


@pytest.fixture
def guide_service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="hello@summit.test",
    )


@pytest.fixture
def auth_client(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


def _mock_stripe_account(account_id="acct_123"):
    return SimpleNamespace(
        id=account_id,
        livemode=False,
        charges_enabled=False,
        payouts_enabled=False,
        details_submitted=False,
        default_currency="usd",
        email="hello@summit.test",
    )


@pytest.mark.django_db
def test_create_onboarding_link_creates_account(
    settings, monkeypatch, owner, guide_service, auth_client
):
    settings.STRIPE_SECRET_KEY = "sk_test"
    settings.STRIPE_CONNECT_RETURN_URL = "https://app.anchorpoint.test/stripe/return"
    settings.STRIPE_CONNECT_REFRESH_URL = "https://app.anchorpoint.test/stripe/refresh"

    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
        is_active=True,
    )

    mock_account = _mock_stripe_account()
    mock_link = SimpleNamespace(url="https://stripe.test/onboarding", expires_at=1700000000)

    monkeypatch.setattr("orgs.api.stripe.Account.create", lambda **kwargs: mock_account)
    monkeypatch.setattr("orgs.api.stripe.AccountLink.create", lambda **kwargs: mock_link)

    url = reverse("guide-service-stripe-link", args=[guide_service.id])
    response = auth_client.post(url)

    assert response.status_code == 201
    payload = response.json()
    assert payload["url"] == mock_link.url

    account = ServiceStripeAccount.objects.get(guide_service=guide_service)
    assert account.account_id == mock_account.id
    guide_service.refresh_from_db()
    assert guide_service.billing_stripe_account == mock_account.id


@pytest.mark.django_db
def test_status_endpoint_refreshes_account(
    settings, monkeypatch, owner, guide_service, auth_client
):
    settings.STRIPE_SECRET_KEY = "sk_test"
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
        is_active=True,
    )

    account = ServiceStripeAccount.objects.create(
        guide_service=guide_service,
        account_id="acct_123",
        charges_enabled=False,
        payouts_enabled=False,
        details_submitted=False,
    )

    refreshed = _mock_stripe_account(account_id="acct_123")
    refreshed.charges_enabled = True
    refreshed.payouts_enabled = True
    login_link = SimpleNamespace(url="https://stripe.test/dashboard")

    monkeypatch.setattr("orgs.api.stripe.Account.retrieve", lambda account_id: refreshed)
    monkeypatch.setattr(
        "orgs.api.stripe.Account.create_login_link", lambda account_id: login_link
    )

    url = reverse("guide-service-stripe-status", args=[guide_service.id])
    response = auth_client.get(url)

    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is True
    assert data["charges_enabled"] is True
    account.refresh_from_db()
    assert account.charges_enabled is True
    assert account.express_dashboard_url == login_link.url


@pytest.mark.django_db
def test_disconnect_deletes_account(
    settings, monkeypatch, owner, guide_service, auth_client
):
    settings.STRIPE_SECRET_KEY = "sk_test"
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
        is_active=True,
    )
    account = ServiceStripeAccount.objects.create(
        guide_service=guide_service,
        account_id="acct_123",
    )

    monkeypatch.setattr("orgs.api.stripe.Account.delete", lambda account_id: None)

    url = reverse("guide-service-stripe-disconnect", args=[guide_service.id])
    response = auth_client.post(url)

    assert response.status_code == 204
    assert ServiceStripeAccount.objects.filter(pk=account.pk).exists() is False
    guide_service.refresh_from_db()
    assert guide_service.billing_stripe_account == ""


@pytest.mark.django_db
def test_webhook_updates_account(settings, monkeypatch, guide_service):
    settings.STRIPE_SECRET_KEY = "sk_test"
    settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
    account = ServiceStripeAccount.objects.create(
        guide_service=guide_service,
        account_id="acct_123",
    )

    event = {
        "type": "account.updated",
        "data": {"object": {"id": "acct_123"}},
    }

    def mock_construct_event(payload, sig_header, secret):
        return event

    refreshed = _mock_stripe_account(account_id="acct_123")
    refreshed.charges_enabled = True

    monkeypatch.setattr(
        "orgs.api.stripe.Webhook.construct_event", mock_construct_event
    )
    monkeypatch.setattr("orgs.api.configure_stripe", lambda: None)
    monkeypatch.setattr("orgs.api.stripe.Account.retrieve", lambda account_id: refreshed)

    client = APIClient()
    response = client.post(
        reverse("stripe-webhook"),
        data={"dummy": "value"},
        format="json",
        HTTP_STRIPE_SIGNATURE="sig_test",
    )

    assert response.status_code == 200
    account.refresh_from_db()
    assert account.charges_enabled is True
    assert account.last_webhook_received_at is not None
