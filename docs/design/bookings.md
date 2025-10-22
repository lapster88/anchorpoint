# Booking Workflows

## Summary
There are a few different booking workflows that we need to support:

### Guest-driven
A guest navigates to a booking page, picks an available time slot, and fills out a booking form
with their information. This generates an email to them confirming their booking and asks them to fill out a wavier,
pay, and provide more information about each guest on the trip.

A guide service owner or manager role needs to be able to turn this workflow on or off for their service. They
also need to be able to configure automatic or manual staffing, ie is a guide assigned automatically or does an office
manager need to assign a guide manually. For the manual case, we need a way to track bookings that still need assignment
for the office manager or owner to assign a guide to.

### Office-driven
This workflow is for an owner or manager who is assisting guests with booking. This workflow is only
available to owners or managers and should allow them to capture some or all of the guest information. We'll detail
required fields below. Then, the guest will provide any remaining information, pay, and complete waivers. These trips 
can be left unstaffed, but again need to be flagged for guide assignment if they are left that way.


