from datetime import datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from availability.models import GuideAvailability, GuideAvailabilityShare
from accounts.models import ServiceMembership, User
from bookings.models import Booking, BookingGuest, GuestProfile
from bookings.services.guest_tokens import issue_guest_access_token
from orgs.models import GuideService
from trips.models import Assignment, Trip, TripTemplate


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
            greta_guest, _ = GuestProfile.objects.update_or_create(
                email="guest@example.test",
                defaults={
                    "first_name": "Greta",
                    "last_name": "Guest",
                    "phone": "555-0300",
                },
            )
            friend_guest, _ = GuestProfile.objects.update_or_create(
                email="friend@example.test",
                defaults={
                    "first_name": "Frank",
                    "last_name": "Friend",
                    "phone": "555-0301",
                },
            )

            self._ensure_membership(owner, summit_service, ServiceMembership.OWNER)
            self._ensure_membership(manager, summit_service, ServiceMembership.MANAGER)
            self._ensure_membership(guide, summit_service, ServiceMembership.GUIDE)
            self._ensure_membership(flex_guide, summit_service, ServiceMembership.GUIDE)
            self._ensure_membership(flex_guide, desert_service, ServiceMembership.GUIDE)

            self.stdout.write(self.style.MIGRATE_HEADING("Ensuring admin superuser"))
            self._ensure_superuser()

            self.stdout.write(self.style.MIGRATE_HEADING("Cleaning old trip + availability data"))
            Assignment.objects.filter(guide__in=[guide, flex_guide]).delete()
            Trip.objects.filter(guide_service__in=[summit_service, desert_service], title__in=[
                "Intro to Trad Climbing",
                "Glacier Travel Fundamentals",
                "Desert Tower Weekend",
            ]).delete()
            GuideAvailability.objects.filter(
                guide__in=[guide, flex_guide],
                source=GuideAvailability.SOURCE_ASSIGNMENT,
            ).delete()

            tz = timezone.get_current_timezone()
            self.stdout.write(self.style.MIGRATE_HEADING("Creating trips & assignments"))
            trad_trip = self._create_trip(
                guide_service=summit_service,
                title="Intro to Trad Climbing",
                location="Index, WA",
                start=timezone.make_aware(datetime(2025, 10, 20, 8, 0), tz),
                end=timezone.make_aware(datetime(2025, 10, 20, 16, 0), tz),
                price_cents=45000,
                difficulty="Beginner",
                duration_hours=8,
                target_client_count=4,
                target_guide_count=1,
                notes="Full day trad fundamentals session.",
            )
            glacier_trip = self._create_trip(
                guide_service=summit_service,
                title="Glacier Travel Fundamentals",
                location="Mt. Baker, WA",
                start=timezone.make_aware(datetime(2025, 10, 28, 6, 0), tz),
                end=timezone.make_aware(datetime(2025, 10, 30, 18, 0), tz),
                price_cents=89000,
                difficulty="Intermediate",
                duration_hours=48,
                target_client_count=6,
                target_guide_count=2,
                notes="Includes snow school and summit attempt.",
            )
            desert_trip = self._create_trip(
                guide_service=desert_service,
                title="Desert Tower Weekend",
                location="Moab, UT",
                start=timezone.make_aware(datetime(2025, 10, 24, 8, 0), tz),
                end=timezone.make_aware(datetime(2025, 10, 25, 20, 0), tz),
                price_cents=72000,
                difficulty="Advanced",
                duration_hours=20,
                target_client_count=2,
                target_guide_count=1,
                notes="Two-day tower objective with overnight camp.",
            )

            Assignment.objects.create(trip=trad_trip, guide=guide)
            Assignment.objects.create(trip=glacier_trip, guide=guide)
            Assignment.objects.create(trip=desert_trip, guide=flex_guide)

            TripTemplate.objects.update_or_create(
                service=summit_service,
                title="Glacier Skills Day",
                defaults={
                    "duration_hours": 8,
                    "location": "Mount Baker, WA",
                    "pricing_currency": "usd",
                    "is_deposit_required": True,
                    "deposit_percent": 25,
                    "pricing_tiers": [
                        {"min_guests": 1, "max_guests": 2, "price_per_guest": "150.00"},
                        {"min_guests": 3, "max_guests": None, "price_per_guest": "120.00"},
                    ],
                    "target_client_count": 6,
                    "target_guide_count": 2,
                    "notes": "Bring glacier kits and crampons.",
                    "created_by": owner,
                    "is_active": True,
                },
            )

            self.stdout.write(self.style.MIGRATE_HEADING("Creating manual availability and bookings"))
            GuideAvailability.objects.filter(
                guide__in=[guide, flex_guide],
                source=GuideAvailability.SOURCE_MANUAL,
            ).delete()
            GuideAvailability.objects.create(
                guide=guide,
                guide_service=summit_service,
                start=timezone.make_aware(datetime(2025, 10, 22, 8, 0), tz),
                end=timezone.make_aware(datetime(2025, 10, 22, 17, 0), tz),
                is_available=False,
                visibility=GuideAvailability.VISIBILITY_DETAIL,
                note="Open for custom trips",
            )
            GuideAvailability.objects.filter(
                guide=guide,
                note="Family in town",
                source=GuideAvailability.SOURCE_MANUAL,
            ).delete()
            off_day = GuideAvailability.objects.create(
                guide=guide,
                guide_service=summit_service,
                start=timezone.make_aware(datetime(2025, 10, 26, 0, 0), tz),
                end=timezone.make_aware(datetime(2025, 10, 27, 0, 0), tz),
                is_available=False,
                visibility=GuideAvailability.VISIBILITY_BUSY,
                note="Family in town",
            )
            GuideAvailabilityShare.objects.get_or_create(
                availability=off_day,
                guide_service=desert_service,
                defaults={"visibility": GuideAvailability.VISIBILITY_BUSY},
            )

            Booking.objects.all().delete()

            booking = Booking.objects.create(
                trip=trad_trip,
                primary_guest=greta_guest,
                party_size=2,
                payment_status=Booking.PAID,
                info_status=Booking.INFO_COMPLETE,
                waiver_status=Booking.WAIVER_SIGNED,
                last_guest_activity_at=timezone.now(),
            )
            BookingGuest.objects.create(booking=booking, guest=greta_guest, is_primary=True)
            BookingGuest.objects.create(booking=booking, guest=friend_guest, is_primary=False)

            issue_guest_access_token(
                guest=greta_guest,
                booking=booking,
                expires_at=trad_trip.end + timedelta(days=1),
                single_use=False,
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

    def _create_trip(
        self,
        *,
        guide_service: GuideService,
        title: str,
        location: str,
        start,
        end,
        price_cents: int,
        difficulty: str,
        duration_hours: int | None = None,
        target_client_count: int | None = None,
        target_guide_count: int | None = None,
        notes: str = "",
    ) -> Trip:
        return Trip.objects.create(
            guide_service=guide_service,
            title=title,
            location=location,
            start=start,
            end=end,
            price_cents=price_cents,
            difficulty=difficulty,
            description=f"Sample itinerary for {title}.",
            duration_hours=duration_hours,
            target_client_count=target_client_count,
            target_guide_count=target_guide_count,
            notes=notes,
        )

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
