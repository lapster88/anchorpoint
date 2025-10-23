# Guide Service User Stories
In this document "users" will always refer to owners and managers, unless otherwise specified.

## Management 
These user stories detail the administration and configuration required to set up a guide service tenant in
Anchorpoint. These will be part of the onbaording for a new tenant, but may require infrequent updates. 

### Stripe Configuration
Users need to be able to connect the stripe account for their guide service into anchor point to support payments. They 
need to be able to see that the stripe integration is successfully connected and have any UI necessary to facilitate
setting up and editing or changing the integration.

### Logo Upload
Users need to be able to upload their guide service logo (JPEG, PNG, SVG) to support UI customization for their service

### Trip Templates
Users need to be able to create and manage trip templates. Trip templates need to have the following:
- Template title
- Duration
- Location
- Pricing Model (can default based on location)
- Target client to guide ratio

Trip templates will then be used in the trip creation form to make trip creation easier. trip creation will also support
a "no template" custom trip as well

### Pricing
Users need to be able to set up pricing models that are used for each trip. Pricing models have the following
properties:
- Price per guest for a number of guests 
- Deposit required?
- Deposit amount (if required)
- Location (optional, for automatic use on trips)

### Guide Roster
Users need to be able to view their guide roster. They need to be able to mark guides as active/inactive for their
service, add or remove guides from their service.

## Reporting
 These user stories detail what a user wants to be able to see for their guide service.
 
### Trip Statistics
Users want to be able to view trip statistics, including:
- Total trips over
  - a date range
  - in a location
  - with a certain number of guests
  - by a certain guide
- histograms and tables for
  - trips by guide 
  - trips by location
  - trips by number of guests
  - trips by lifecycle
- view trips by lifecycle state (see trips documentation for more detail)

### Guest Statistics
Users want to be able to see statistics about guests, including:
- average number of trips per guest
- percentage of repeat guests
- histogram of guests grouped by number of trips with the service