# Event schema changelog

Append-only record of event-schema evolution. The CI compatibility gate
(`scripts/event_compat_check.mjs`) requires **every added event or field** to
be mentioned here — by event struct name and field name — before the PR can
merge. Breaking changes are rejected outright; they need a governed
v1 → v2 migration (see [README.md](README.md#versioning-v1--v2-coexistence)).

## v1.0.0 — 2026-10-20

Initial registry (issue #213): all 33 events emitted by
`contracts/streaming-payments` are catalogued with topic layout, data fields,
JSON Schemas (`v1/events/`) and a flat fingerprint table
(`registry.json`). Two contract types are referenced by event fields and so are
versioned here: the `StreamPolicy` struct (`StreamPolicySet`) and the
`OwnershipRole` enum, which the ownership-handoff events encode as a variant
symbol. No shape change was made by the registry work itself — every
fingerprint is the event the contract already emits.

<!--
Add new entries here, newest first (immediately above `## v1.0.0`). Format
(what the gate greps for):

- `StreamCreated`: added field `memo` (`Address`) — consumers should ignore
  unknown keys; see <PR link>.
-->
