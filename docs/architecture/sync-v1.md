# Sync v1 (Milestone 2)

Status: implemented for events, tasks, lists, list items and quick-capture items.
Not yet covered: attachments, push notifications. Google Calendar sync is specified in calendar-sync-v1.md.

## Shape

- **Local first.** Every write goes into the device's SQLite table and the `local_outbox`
  in one transaction (`apps/mobile/src/data/repository.ts`). The UI reads only SQLite.
- **Push.** `POST /api/sync/push` takes outbox mutations in batches of up to 250. Each
  mutation carries a client UUID that the server records, so retries are idempotent.
- **Pull.** `GET /api/sync/pull?since=<cursor>` returns records changed since the cursor.
  The cursor is stored in `local_sync_meta`. Deletions are tombstones (`deleted_at`).
- **Trigger.** Sync runs on sign-in, on app foreground, every 30 s while active, about
  1.5 s after a local write (debounced), and with backoff (5 s → 5 min) while offline.

## Validation and authorisation (server)

- Every mutation's payload is validated against its entity and operation schema
  (`parseSyncPayload` in `@diade/validation`). UPDATE schemas have no defaults, so a
  missing field means "unchanged".
- Authorisation is checked against the stored row, not the client's view:
  - Personal events and tasks: only the creator may update or delete them.
  - Capture items: always private to their creator.
  - List items: the list must belong to the caller's space.
- A mutation the server will never accept is returned in `rejectedMutations`
  (`INVALID_PAYLOAD`, `FORBIDDEN` or `APPLY_FAILED`). The client drops it from the outbox
  so one bad mutation cannot block everything behind it.

## Conflict policy

- **Field-level merge.** An UPDATE carries only the fields the member changed, so two
  people editing different fields of the same record both keep their change.
- **Pending local changes win until pushed.** When a pulled row arrives, any unsynced
  mutations for that record are overlaid on it, so local intent stays visible.
- **Last write wins per field**, in the order the server applies mutations. The server
  does not compare client timestamps; they only order a single device's outbox.
- **Deletes propagate** as tombstones on pull.
- **Rejected mutations are reconciled.** A rejected INSERT is removed locally. A rejected
  UPDATE or DELETE forces a full re-pull, which restores the server's state.

## Known limitations

- Editing one occurrence of a recurring event edits the whole series. Per-occurrence
  exceptions need RFC 5545 `RECURRENCE-ID` handling and are deferred.
- No NetInfo: reconnect is detected by the periodic and foreground triggers, not by an
  OS network event.
- Session tokens are still a development mock, so the sync API will return 401 until real
  Better Auth sessions are wired into the mobile app.
