import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="examplepass",
        first_name="Lead",
        last_name="Guide",
    )


def test_register_creates_user_and_returns_tokens(db, client):
    payload = {
        "email": "new@example.com",
        "password": "password123",
        "first_name": "New",
        "last_name": "User",
        "display_name": "New User",
    }
    response = client.post("/api/auth/register/", payload, format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == payload["email"]
    assert "access" in body and "refresh" in body
    assert User.objects.filter(email=payload["email"]).exists()


def test_register_with_existing_email_is_rejected(db, client, user):
    payload = {
        "email": "guide@example.com",
        "password": "password123",
        "first_name": "New",
        "last_name": "User",
    }
    response = client.post("/api/auth/register/", payload, format="json")

    assert response.status_code == 400
    assert "email" in response.json()


def test_login_returns_tokens_and_user_payload(db, client, user):
    response = client.post(
        "/api/auth/login/",
        {"email": "guide@example.com", "password": "examplepass"},
        format="json",
    )

    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {"access", "refresh", "user"}
    assert data["user"]["email"] == "guide@example.com"


def test_refresh_issues_new_access_token(db, client, user):
    login_response = client.post(
        "/api/auth/login/",
        {"email": "guide@example.com", "password": "examplepass"},
        format="json",
    )

    refresh_token = login_response.json()["refresh"]
    refresh_response = client.post(
        "/api/auth/refresh/", {"refresh": refresh_token}, format="json"
    )

    assert refresh_response.status_code == 200
    assert "access" in refresh_response.json()


def test_me_endpoint_returns_authenticated_user(db, client, user):
    login_response = client.post(
        "/api/auth/login/",
        {"email": "guide@example.com", "password": "examplepass"},
        format="json",
    )
    access = login_response.json()["access"]

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.json()["email"] == "guide@example.com"


def test_me_endpoint_requires_authentication(db, client):
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_me_patch_updates_user_profile(db, client, user):
    client.force_authenticate(user=user)
    payload = {
        "first_name": "Updated",
        "last_name": "Name",
        "display_name": "Updated Name",
        "email": "updated@example.com",
    }

    response = client.patch("/api/auth/me/", payload, format="json")

    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "Updated"
    assert data["display_name"] == "Updated Name"
    user.refresh_from_db()
    assert user.email == "updated@example.com"
    assert user.username == "updated@example.com"


def test_me_patch_rejects_duplicate_email(db, client, user):
    other = User.objects.create_user(
        username="taken@example.com",
        email="taken@example.com",
        password="password123",
    )
    client.force_authenticate(user=user)

    response = client.patch(
        "/api/auth/me/",
        {"email": "taken@example.com"},
        format="json",
    )

    assert response.status_code == 400
    assert "email" in response.json()


def test_change_password_requires_correct_current_password(db, client, user):
    client.force_authenticate(user=user)
    response = client.post(
        "/api/auth/change-password/",
        {
            "current_password": "wrongpass",
            "new_password": "newsecurepass",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "current_password" in response.json()


def test_change_password_updates_password(db, client, user):
    client.force_authenticate(user=user)
    response = client.post(
        "/api/auth/change-password/",
        {
            "current_password": "examplepass",
            "new_password": "newsecurepass",
        },
        format="json",
    )

    assert response.status_code == 204
    user.refresh_from_db()
    assert user.check_password("newsecurepass")
