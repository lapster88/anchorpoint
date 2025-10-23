# Cronofy Integration Considerations

Cronofy is a calendar infrastructure platform that can centralize provider-neutral calendar sync, availability lookup, and scheduling workflows. Below are initial notes on how it could fit into Anchorpoint’s roadmap.

## Why Cronofy?
- **Unified Provider Coverage**: Supports Google, Microsoft 365/Outlook.com, Exchange, Apple, and generic CalDAV with a single API, avoiding per-provider OAuth and sync logic.
- **Real-Time Availability**: Smart Invites and Availability API let us query guide busy/free windows without storing every external event locally.
- **Webhooks & Push Sync**: Cronofy webhooks can call back when a guide’s external calendar changes, reducing the need for frequent polling.
- **Compliance & Privacy**: SOC2/GDPR compliance and fine-grained scopes help meet outfitter data requirements, especially for enterprise customers.
- **Scheduling Workflows**: Their Scheduler product could power guided booking flows where guests request slots that fit guide availability automatically.

## Potential Architecture
1. **Account Linking**: Guides authorize Cronofy from the profile/calendar integrations page. Cronofy handles OAuth with the upstream provider.
2. **Token Storage**: Store Cronofy profile IDs and access tokens in `GuideCalendarIntegration`. Cronofy manages provider refresh flow; we only keep Cronofy credentials.
3. **Availability Sync**:
   - Option A: Continue mirroring events into `GuideAvailability` (current model), using Cronofy’s Sync API instead of direct provider imports.
   - Option B: Query Cronofy Availability API on demand, using local `GuideAvailability` only for manual overrides and assignments.
4. **Webhooks**: Configure Cronofy webhook endpoints in the backend to ingest event changes and translate updates into availability rows.
5. **Scheduling**: Use Cronofy Smart Invites for two-way confirmations when booking trips, ensuring guide calendars stay in sync and cancellations propagate.

## Open Questions
- **License Cost**: Cronofy pricing is per-connected calendar; need to gauge budget vs. expected number of guides.
- **Data Residency**: Verify if Cronofy’s hosting regions align with customer requirements (US/EU).
- **Hybrid Model**: Decide whether to keep `GuideAvailability` as the source of truth or treat Cronofy as the live availability service.
- **Offline Access**: If Cronofy is unavailable, do we have sufficient cached availability to keep guides operational?
- **Scalability**: Evaluate webhook throughput and rate limits for peak seasons (many guides updating calendars simultaneously).

## Next Steps
1. Prototype Cronofy OAuth for a guide and record the data we receive (profile ID, calendars, timezone).
2. Map Cronofy event payloads to our `GuideAvailability` schema; determine minimum fields we must persist.
3. Design background jobs or webhook handlers to keep availability fresh without manual runs.
4. Discuss pricing/terms with Cronofy sales and confirm SLA/uptime guarantees.
5. Update product roadmap to reflect whether Cronofy replaces or supplements the current manual/sync approach.
