# Trip Requirements

This document will detail the requirements relating to trip management in Anchorpoint

## Trip Definition

A trip is essentially the guide service product and represents the transaction with the customer in Anchorpoint. Trips
have a lifecycle form creation to completion, with steps along the way inclusing payment, waiver completion, guest info
forms, the trip occurring, and follow up.

### Trip Data

Trips contain the following info:

- Title
  - Short identifer for the trip
- Location
  - General location of the trip (like Joshua Tree, Mammoth Lakes)
- Price
  - Total trip price. can be calculated from the number of guests and the per guest price, which can be dependent on
the number of guests
- Description
  - Detailed description of the trip, customer facing
- Internal Notes
  - any additional notes about the trip for the office and/or guide team
- Assigned Guides
  - the guides who are responsible for running the trip
- Primary Guest
  - Customer POC for the trip
- Additional Guests (optional)
  - Additional guests that want access to the trip for waivers or guest info forms
- Total number of guests
  - number of participants on the trip, doesn't need to match the number of "guests" that have access in anchorpoint
- Payment status
  - has the trip been paid for? total? just deposit?
- Waiver Status
  - have all guest waivers been filled out?
- Guest info Status 
  - have all guests filled out the prebooking form?