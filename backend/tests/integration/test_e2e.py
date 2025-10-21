import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from orgs.models import GuideService


@pytest.mark.django_db
def test_end_to_end_availability_flow():
    client = APIClient()

    # Register user
    register_payload = {
        "email": "guide@example.com",
        "password": "pass12345",
        "first_name": "Guide",
        "last_name": "Person",
        "display_name": "Guide Person",
    }
    register_response = client.post("/api/auth/register/", register_payload, format="json")
    assert register_response.status_code == 201
    access_token = register_response.data["access"]

    # Prepare org + membership
    service = GuideService.objects.create(
        name="Adventure Guides", slug="adventure-guides", contact_email="admin@adventure.com"
    )
    user = User.objects.get(email="guide@example.com")
    ServiceMembership.objects.create(user=user, guide_service=service, role=ServiceMembership.GUIDE)

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    # Create availability slot
    start = timezone.now() + timezone.timedelta(days=3)
    end = start + timezone.timedelta(hours=5)
    availability_response = client.post(
        "/api/auth/availabilities/",
        {
            "guide_service": service.id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "is_available": False,
            "visibility": "busy",
            "note": "Prep work",
        },
        format="json",
    )
    assert availability_response.status_code == 201
    availability_id = availability_response.data["id"]

    # Verify availability listing
    list_response = client.get("/api/auth/availabilities/")
    assert list_response.status_code == 200
    assert any(item["id"] == availability_id for item in list_response.data)

    # Add share override
    share_response = client.post(
        f"/api/auth/availabilities/{availability_id}/shares/",
        {"guide_service": service.id, "visibility": "detail"},
        format="json",
    )
    assert share_response.status_code == 201

    # Link calendar integration
    integration_response = client.post(
        "/api/auth/calendar-integrations/",
        {"provider": "google", "external_id": "cal-123", "is_active": True},
        format="json",
    )
    assert integration_response.status_code == 201

    # Check memberships endpoint
    memberships_response = client.get("/api/auth/memberships/")
    assert memberships_response.status_code == 200
    assert memberships_response.data[0]["guide_service"] == service.id

    # Clean up availability
    delete_response = client.delete(f"/api/auth/availabilities/{availability_id}/")
    assert delete_response.status_code == 204

    final_list = client.get("/api/auth/availabilities/")
    assert final_list.status_code == 200
    assert all(item["id"] != availability_id for item in final_list.data)
