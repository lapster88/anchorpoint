import io

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from orgs.models import GuideService


def _logo_file(name: str = "logo.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    image = Image.new("RGB", (32, 32), color="blue")
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="password123",
        first_name="Olivia",
        last_name="Owner",
    )


@pytest.fixture
def guide(db):
    return User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
        first_name="Gabe",
        last_name="Guide",
    )


@pytest.fixture
def guide_service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="owner@example.com",
    )


@pytest.mark.django_db
def test_owner_uploads_logo(settings, tmp_path, owner, guide_service):
    settings.MEDIA_ROOT = tmp_path
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
    )

    client = APIClient()
    client.force_authenticate(owner)

    url = reverse("guide-service-logo", args=[guide_service.id])
    response = client.post(url, {"logo": _logo_file()}, format="multipart")

    assert response.status_code == 200
    payload = response.json()
    assert payload["logo_url"]
    guide_service.refresh_from_db()
    assert guide_service.logo
    assert guide_service.logo.name.startswith("guide-logos/")


@pytest.mark.django_db
def test_upload_rejects_invalid_type(settings, tmp_path, owner, guide_service):
    settings.MEDIA_ROOT = tmp_path
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
    )

    client = APIClient()
    client.force_authenticate(owner)

    file = SimpleUploadedFile("document.txt", b"not an image", content_type="text/plain")
    response = client.post(
        reverse("guide-service-logo", args=[guide_service.id]),
        {"logo": file},
        format="multipart",
    )

    assert response.status_code == 400
    assert "Unsupported" in response.data["detail"]


@pytest.mark.django_db
def test_delete_logo(settings, tmp_path, owner, guide_service):
    settings.MEDIA_ROOT = tmp_path
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
    )

    guide_service.logo.save(
        "existing.png",
        ContentFile(_logo_file().read(), name="existing.png"),
    )

    client = APIClient()
    client.force_authenticate(owner)

    response = client.delete(reverse("guide-service-logo", args=[guide_service.id]))
    assert response.status_code == 204
    guide_service.refresh_from_db()
    assert not guide_service.logo


@pytest.mark.django_db
def test_non_owner_cannot_update_logo(settings, tmp_path, owner, guide, guide_service):
    settings.MEDIA_ROOT = tmp_path
    ServiceMembership.objects.create(
        user=owner,
        guide_service=guide_service,
        role=ServiceMembership.OWNER,
    )
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service,
        role=ServiceMembership.GUIDE,
    )

    client = APIClient()
    client.force_authenticate(guide)

    response = client.post(
        reverse("guide-service-logo", args=[guide_service.id]),
        {"logo": _logo_file()},
        format="multipart",
    )

    assert response.status_code == 403
