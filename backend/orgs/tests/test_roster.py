import secrets
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceInvitation, ServiceMembership, User
from orgs.models import GuideService
from trips.models import Assignment, Trip


@pytest.fixture
def service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="owner@summit.test",
    )


@pytest.fixture
def owner(db, service):
    user = User.objects.create_user(
        username="owner@summit.test",
        email="owner@summit.test",
        password="password123",
        first_name="Olivia",
        last_name="Owner",
    )
    ServiceMembership.objects.create(
        user=user,
        guide_service=service,
        role=ServiceMembership.OWNER,
        is_active=True,
    )
    return user


@pytest.fixture
def api_client(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


def test_roster_list_includes_members_and_invitations(api_client, service):
    guide = User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
        first_name="Gabe",
        last_name="Guide",
    )
    ServiceMembership.objects.create(
        user=guide,
        guide_service=service,
        role=ServiceMembership.GUIDE,
        is_active=True,
    )

    ServiceInvitation.objects.create(
        guide_service=service,
        email="invitee@example.com",
        role=ServiceMembership.GUIDE,
        status=ServiceInvitation.STATUS_PENDING,
        token=secrets.token_urlsafe(16),
        expires_at=timezone.now() + timedelta(days=7),
    )

    response = api_client.get(f"/api/orgs/{service.id}/members/")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["members"]) == 2  # owner + guide
    assert len(payload["invitations"]) == 1


def test_inviting_existing_user_creates_membership(api_client, service):
    existing = User.objects.create_user(
        username="manager@example.com",
        email="manager@example.com",
        password="password123",
    )

    response = api_client.post(
        f"/api/orgs/{service.id}/members/",
        {"email": existing.email, "role": ServiceMembership.MANAGER},
        format="json",
    )
    assert response.status_code == 201
    membership = ServiceMembership.objects.get(
        user=existing, guide_service=service
    )
    assert membership.role == ServiceMembership.MANAGER
    assert membership.is_active is True


def test_inviting_new_user_creates_invitation(api_client, service):
    response = api_client.post(
        f"/api/orgs/{service.id}/members/",
        {"email": "newinvitee@example.com", "role": ServiceMembership.GUIDE},
        format="json",
    )
    assert response.status_code == 201
    data = response.json()["invitation"]
    assert data["email"] == "newinvitee@example.com"
    assert ServiceInvitation.objects.filter(email="newinvitee@example.com").exists()


def test_resend_invitation_updates_token(api_client, service):
    invitation = ServiceInvitation.objects.create(
        guide_service=service,
        email="pending@example.com",
        role=ServiceMembership.GUIDE,
        status=ServiceInvitation.STATUS_PENDING,
        token=secrets.token_urlsafe(12),
        expires_at=timezone.now() + timedelta(days=7),
    )

    response = api_client.post(
        f"/api/orgs/{service.id}/invitations/{invitation.id}/resend/",
        {},
        format="json",
    )
    assert response.status_code == 200
    invitation.refresh_from_db()
    assert invitation.invited_at.date() == timezone.now().date()


def test_cancel_invitation(api_client, service):
    invitation = ServiceInvitation.objects.create(
        guide_service=service,
        email="cancel@example.com",
        role=ServiceMembership.GUIDE,
        status=ServiceInvitation.STATUS_PENDING,
        token=secrets.token_urlsafe(12),
        expires_at=timezone.now() + timedelta(days=7),
    )

    response = api_client.delete(
        f"/api/orgs/{service.id}/invitations/{invitation.id}/",
    )
    assert response.status_code == 204
    invitation.refresh_from_db()
    assert invitation.status == ServiceInvitation.STATUS_CANCELLED


def test_deactivating_membership_removes_future_assignments(api_client, service):
    guide = User.objects.create_user(
        username="guide2@example.com",
        email="guide2@example.com",
        password="password123",
    )
    membership = ServiceMembership.objects.create(
        user=guide,
        guide_service=service,
        role=ServiceMembership.GUIDE,
        is_active=True,
    )
    trip = Trip.objects.create(
        guide_service=service,
        title="Glacier Day",
        location="Mt. Baker",
        start=timezone.now() + timedelta(days=3),
        end=timezone.now() + timedelta(days=4),
        price_cents=15000,
    )
    Assignment.objects.create(trip=trip, guide=guide)

    response = api_client.patch(
        f"/api/orgs/{service.id}/members/{membership.id}/",
        {"is_active": False},
        format="json",
    )
    assert response.status_code == 200
    assert not Assignment.objects.filter(trip=trip, guide=guide).exists()


def test_last_owner_cannot_be_removed(api_client, service, owner):
    owner_membership = ServiceMembership.objects.get(
        user=owner, guide_service=service
    )
    response = api_client.patch(
        f"/api/orgs/{service.id}/members/{owner_membership.id}/",
        {"is_active": False},
        format="json",
    )
    assert response.status_code == 400


def test_invitation_acceptance_creates_user_and_membership(db, service, owner):
    api_client = APIClient()
    api_client.force_authenticate(owner)
    response = api_client.post(
        f"/api/orgs/{service.id}/members/",
        {"email": "brandnew@example.com", "role": ServiceMembership.GUIDE},
        format="json",
    )
    token = response.json()["invitation"]["accept_url"].split("/")[-1]

    accept_client = APIClient()
    accept_response = accept_client.post(
        f"/api/auth/invitations/{token}/accept/",
        {
            "password": "NewPass123!",
            "first_name": "New",
            "last_name": "Guide",
            "display_name": "New Guide",
        },
        format="json",
    )
    assert accept_response.status_code == 200
    data = accept_response.json()
    assert "access" in data and "refresh" in data
    membership = ServiceMembership.objects.get(
        guide_service=service, user__email="brandnew@example.com"
    )
    assert membership.is_active is True
