from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.db import DatabaseError

from .models import Assignment, Trip


def _get_guide_availability_model():
    from accounts.models import GuideAvailability
    return GuideAvailability


def _create_or_update_assignment_block(assignment):
    GuideAvailability = _get_guide_availability_model()
    try:
        GuideAvailability.objects.update_or_create(
            guide=assignment.guide,
            trip=assignment.trip,
            source=GuideAvailability.SOURCE_ASSIGNMENT,
            defaults={
                'guide_service': assignment.trip.guide_service,
                'start': assignment.trip.start,
                'end': assignment.trip.end,
                'is_available': False,
                'visibility': GuideAvailability.VISIBILITY_DETAIL,
                'note': f"Trip assignment: {assignment.trip.title}",
            },
        )
    except DatabaseError:
        # During migrations tables may not exist yet; swallow errors gracefully.
        pass


def _delete_assignment_block(guide_id, trip_id):
    GuideAvailability = _get_guide_availability_model()
    try:
        GuideAvailability.objects.filter(
            guide_id=guide_id,
            trip_id=trip_id,
            source=GuideAvailability.SOURCE_ASSIGNMENT,
        ).delete()
    except DatabaseError:
        pass


@receiver(pre_save, sender=Assignment)
def handle_assignment_pre_save(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        previous = Assignment.objects.get(pk=instance.pk)
    except Assignment.DoesNotExist:
        return
    if previous.trip_id != instance.trip_id or previous.guide_id != instance.guide_id:
        _delete_assignment_block(previous.guide_id, previous.trip_id)


@receiver(post_save, sender=Assignment)
def handle_assignment_post_save(sender, instance, created, **kwargs):
    _create_or_update_assignment_block(instance)


@receiver(post_delete, sender=Assignment)
def handle_assignment_post_delete(sender, instance, **kwargs):
    _delete_assignment_block(instance.guide_id, instance.trip_id)


@receiver(post_save, sender=Trip)
def handle_trip_post_save(sender, instance, **kwargs):
    GuideAvailability = _get_guide_availability_model()
    try:
        GuideAvailability.objects.filter(
            trip=instance,
            source=GuideAvailability.SOURCE_ASSIGNMENT,
        ).update(
            guide_service=instance.guide_service,
            start=instance.start,
            end=instance.end,
            note=f"Trip assignment: {instance.title}",
        )
    except DatabaseError:
        pass
