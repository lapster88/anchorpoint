from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import (
    GuideAvailability,
    GuideAvailabilityShare,
    ServiceMembership,
    User,
)
from bookings.models import Booking, GuestProfile
from orgs.models import GuideService
from trips.models import Assignment, Trip


SEED_PASSWORD = "Anchorpoint123!"
SUPERUSER_EMAIL = "admin@summitguides.test"
SUPERUSER_PASSWORD = "AdminAnchorpoint123!"


class Command(BaseCommand):
    help = "Populate the local development database with sample data."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusing to seed data while DEBUG is False.")

        with transaction.atomic():
            self.stdout.write(self.style.MIGRATE_HEADING("Creating guide services"))
            summit_service = self._ensure_service(
                slug="summit-guides",
                name="Summit Guides",
                email="hello@summitguides.test",
                phone="555-0100",
            )
            desert_service = self._ensure_service(
                slug="desert-adventures",
                name="Desert Adventures Co.",
                email="info@desertadventures.test",
                phone="555-0200",
            )

            self.stdout.write(self.style.MIGRATE_HEADING("Creating users & memberships"))
            owner = self._ensure_user(
                email="owner@summitguides.test",
                first_name="Olivia",
                last_name="Owner",
                display_name="Olivia Owner",
            )
            manager = self._ensure_user(
                email="manager@summitguides.test",
                first_name="Morgan",
                last_name="Manager",
                display_name="Morgan Manager",
            )
            guide = self._ensure_user(
                email="guide@summitguides.test",
                first_name="Gabe",
                last_name="Guide",
                display_name="Gabe Guide",
            )
            flex_guide = self._ensure_user(
                email="flex@summitguides.test",
                first_name="Finn",
                last_name="Flexible",
                display_name="Finn Flexible",
            )
            guest = self._ensure_user(
                email="guest@example.test",
                first_name="Greta",
                last_name="Guest",
                display_name="Greta Guest",
            )
            GuestProfile.objects.get_or_create(user=guest, defaults={"phone": "555-0300"})

            self._ensure_membership(owner, summit_service, ServiceMembership.OWNER)
            self._ensure_membership(manager, summit_service, ServiceMembership.MANAGER)
            self._ensure_membership(guide, summit_service, ServiceMembership.GUIDE)
            self._ensure_membership(flex_guide, summit_service, ServiceMembership.GUIDE)
            self._ensure_membership(flex_guide, desert_service, ServiceMembership.GUIDE)
            self._ensure_membership(guest, summit_service, ServiceMembership.GUEST)

            self.stdout.write(self.style.MIGRATE_HEADING("Ensuring admin superuser"))
            self._ensure_superuser()

            self.stdout.write(self.style.MIGRATE_HEADING("Creating trips & assignments"))
            now = timezone.now()
            trips = [
                self._ensure_trip(
                    guide_service=summit_service,
                    title="Intro to Trad Climbing",
                    location="Index, WA",
                    start=now + timedelta(days=3),
                    end=now + timedelta(days=3, hours=8),
                    capacity=4,
                    price_cents=45000,
                    difficulty="Beginner",
                ),
                self._ensure_trip(
                    guide_service=summit_service,
                    title="Glacier Travel Fundamentals",
                    location="Mt. Baker, WA",
                    start=now + timedelta(days=10),
                    end=now + timedelta(days=12),
                    capacity=6,
                    price_cents=89000,
                    difficulty="Intermediate",
                ),
                self._ensure_trip(
                    guide_service=desert_service,
                    title="Desert Tower Weekend",
                    location="Moab, UT",
                    start=now + timedelta(days=17),
                    end=now + timedelta(days=18, hours=12),
                    capacity=2,
                    price_cents=72000,
                    difficulty="Advanced",
                ),
            ]

            Assignment.objects.get_or_create(
                trip=trips[0],
                guide=guide,
                defaults={"role": Assignment.LEAD},
            )
            Assignment.objects.get_or_create(
                trip=trips[1],
                guide=guide,
                defaults={"role": Assignment.LEAD},
            )
            Assignment.objects.get_or_create(
                trip=trips[2],
                guide=flex_guide,
                defaults={"role": Assignment.LEAD},
            )

            self.stdout.write(self.style.MIGRATE_HEADING("Creating manual availability and bookings"))
            GuideAvailability.objects.get_or_create(
                guide=guide,
                start=now + timedelta(days=1, hours=8),
                end=now + timedelta(days=1, hours=18),
                defaults={
                    "is_available": True,
                    "guide_service": summit_service,
                    "visibility": GuideAvailability.VISIBILITY_DETAIL,
                    "note": "Open for custom trips",
                },
            )
            off_day, _ = GuideAvailability.objects.get_or_create(
                guide=guide,
                start=now + timedelta(days=5),
                end=now + timedelta(days=6),
                defaults={
                    "is_available": False,
                    "guide_service": summit_service,
                    "visibility": GuideAvailability.VISIBILITY_BUSY,
                    "note": "Family in town",
                },
            )
            GuideAvailabilityShare.objects.get_or_create(
                availability=off_day,
                guide_service=desert_service,
                defaults={"visibility": GuideAvailability.VISIBILITY_BUSY},
            )

            Booking.objects.get_or_create(
                trip=trips[0],
                guest=guest,
                defaults={"party_size": 2, "status": Booking.PAID},
            )

        self.stdout.write(self.style.SUCCESS("Development seed data created."))
        self.stdout.write(self.style.NOTICE(f"Sample login accounts use password: {SEED_PASSWORD}"))
        self.stdout.write(self.style.NOTICE(f"Admin superuser {SUPERUSER_EMAIL} password: {SUPERUSER_PASSWORD}"))

    def _ensure_service(self, slug: str, name: str, email: str, phone: str) -> GuideService:
        service, _ = GuideService.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "contact_email": email, "phone": phone},
        )
        if service.name != name or service.contact_email != email or service.phone != phone:
            service.name = name
            service.contact_email = email
            service.phone = phone
            service.save(update_fields=["name", "contact_email", "phone"])
        return service

    def _ensure_user(
        self,
        email: str,
        first_name: str,
        last_name: str,
        display_name: str,
    ) -> User:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": first_name,
                "last_name": last_name,
                "display_name": display_name,
            },
        )
        if created:
            user.set_password(SEED_PASSWORD)
            user.save()
        else:
            fields_to_update = {}
            if user.first_name != first_name:
                fields_to_update["first_name"] = first_name
            if user.last_name != last_name:
                fields_to_update["last_name"] = last_name
            if user.display_name != display_name:
                fields_to_update["display_name"] = display_name
            if fields_to_update:
                for attr, value in fields_to_update.items():
                    setattr(user, attr, value)
                user.save(update_fields=list(fields_to_update.keys()))
            if not user.has_usable_password():
                user.set_password(SEED_PASSWORD)
                user.save(update_fields=["password"])
        return user

    def _ensure_membership(self, user: User, service: GuideService, role: str) -> ServiceMembership:
        membership, created = ServiceMembership.objects.get_or_create(
            user=user,
            guide_service=service,
            role=role,
            defaults={"is_active": True},
        )
        if not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active"])
        if created:
            self.stdout.write(
                self.style.NOTICE(f"Added {user.email} as {role} for {service.name}")
            )
        return membership

    def _ensure_trip(
        self,
        *,
        guide_service: GuideService,
        title: str,
        location: str,
        start,
        end,
        capacity: int,
        price_cents: int,
        difficulty: str,
    ) -> Trip:
        trip, created = Trip.objects.get_or_create(
            guide_service=guide_service,
            title=title,
            start=start,
            defaults={
                "location": location,
                "end": end,
                "capacity": capacity,
                "price_cents": price_cents,
                "difficulty": difficulty,
                "description": f"Sample itinerary for {title}.",
            },
        )
        if not created:
            fields_to_update = {}
            if trip.location != location:
                fields_to_update["location"] = location
            if trip.end != end:
                fields_to_update["end"] = end
            if trip.capacity != capacity:
                fields_to_update["capacity"] = capacity
            if trip.price_cents != price_cents:
                fields_to_update["price_cents"] = price_cents
            if trip.difficulty != difficulty:
                fields_to_update["difficulty"] = difficulty
            desired_description = f"Sample itinerary for {title}."
            if trip.description != desired_description:
                fields_to_update["description"] = desired_description
            if fields_to_update:
                for attr, value in fields_to_update.items():
                    setattr(trip, attr, value)
                trip.save(update_fields=list(fields_to_update.keys()))
        return trip

    def _ensure_superuser(self) -> User:
        user, created = User.objects.get_or_create(
            email=SUPERUSER_EMAIL,
            defaults={
                "username": SUPERUSER_EMAIL,
                "first_name": "Admin",
                "last_name": "User",
                "display_name": "Admin User",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        flag_updates = {}
        if not user.is_staff:
            flag_updates["is_staff"] = True
        if not user.is_superuser:
            flag_updates["is_superuser"] = True
        if flag_updates:
            for attr, value in flag_updates.items():
                setattr(user, attr, value)
            user.save(update_fields=list(flag_updates.keys()))
        if created or not user.has_usable_password():
            user.set_password(SUPERUSER_PASSWORD)
            user.save(update_fields=["password"])
        return user
