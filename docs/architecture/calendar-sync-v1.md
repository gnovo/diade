# Calendar sync v1 (Milestone 3)

Status: implemented on branch `feat/calendar-sync-v1` (API, mobile app, tests). Verified by
unit tests, an authorisation suite and an integration suite against Postgres. **Not yet run
on an Android device or against live Google.** See "Rollout" for what is needed first.

Replaces the "Google Calendar sync (Milestone 3)" line in [sync-v1.md](./sync-v1.md).

## Goal

Each member can connect their Google account and bring **several Google calendars** into
Díade, much like the Android calendar app. Synced events are **shared with the partner by
default**, and each member can narrow that per calendar or per event. The Calendar screen
shows synced events together with Díade events, tasks and important dates in one agenda.

## Scope

In scope for v1:

- Android only.
- **Read-only** from Google. Díade never writes to Google.
- Multiple calendars per member, each with its own on/off, visibility and colour.
- Visibility levels: `shared`, `busy_only`, `private`. Default `shared`.
- Server-side sync, so the partner sees the data and sync works with the app closed.
- A unified agenda: Díade events, Google events, tasks with a due date, important dates.
- A `priority` flag on tasks so important ones stay visible.

Out of scope (see "Later"): write-back to Google, iOS, month/week grid, push notifications
from Google, non-Google calendars, per-occurrence editing, "free together" view.

## Assumptions

- Díade has exactly two members, so volume is tiny (roughly 2 users x ~10 calendars). The
  design avoids queues, Durable Objects and webhooks on purpose.
- Mobile stays offline-first. The UI reads only local SQLite.
- Both members may connect Google; they may also connect the same shared calendar. Events
  are deduplicated for display (see "Duplicates").

## Decisions

1. **Synced events live in their own tables, not in `events`.** They are server-owned and
   read-only. Putting them in `events` would send them through the outbox and the
   mutation authorisation path, which assume the client is the author.
2. **Server-side sync with the stored refresh token.** The Worker pulls from Google and
   the existing pull endpoint delivers the result to both phones.
3. **Incremental consent.** Calendar scopes are requested when the member opts in from the
   app, never at sign-in. Sign-in keeps asking for identity only.
4. **Narrowest scopes**: `calendar.calendarlist.readonly` and `calendar.events.readonly`
   (not `calendar.readonly`).
5. **Settings changes go through REST, not the outbox.** Connection, calendar toggles and
   visibility are server-owned. Consequence: they need a connection. Reads still work
   offline.
6. **Expand recurring events on the server** (`singleEvents=true`). The client never sees
   a Google `RRULE`, so Google recurrence cannot clash with `recurrenceRule` on Díade
   events.
7. **Redaction happens on the server.** A partner's device must never receive fields the
   owner chose not to share, so the client cannot be trusted to hide them.

## Data model

Migration `0003_calendar_sync`. Names follow the existing Drizzle conventions.

### `external_calendars`

One row per Google calendar a member can see.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | text fk users, cascade | Owner |
| `account_id` | text fk accounts, cascade | The Google account the token belongs to |
| `google_calendar_id` | text | Unique with `account_id` |
| `name` | text | Google's `summaryOverride ?? summary` |
| `color` | text | Google `backgroundColor`; member may override in Díade later |
| `time_zone` | text | |
| `access_role` | text | `owner`, `writer`, `reader`, `freeBusyReader` |
| `sync_enabled` | boolean | Defaults to Google's `selected` flag, which mirrors Android |
| `visibility` | text | `shared` (default), `busy_only`, `private` |
| `sync_token` | text | Google incremental token; null forces a full sync |
| `window_start`, `window_end` | timestamp | Window used by the last full sync |
| `confirmed_at` | timestamp | Null until the member confirms the picker. Nothing syncs and nothing is shared before then |
| `last_synced_at` | timestamp | |
| `last_full_sync_at` | timestamp | Drives the weekly re-baseline |
| `last_error` | text | `needs_reauth`, `rate_limited` or `sync_failed`. Never contains event content. Cleared on success |
| `lock_until` | timestamp | Sync lease, see "Concurrency" |
| `created_at`, `updated_at`, `deleted_at` | timestamp | `deleted_at` when Google no longer lists it |

Calendars with `access_role = freeBusyReader` can only supply busy blocks and are forced
to `busy_only`.

### `external_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `calendar_id` | uuid fk external_calendars, cascade | |
| `user_id` | text | Denormalised owner, for the pull query |
| `google_event_id` | text | Unique with `calendar_id` |
| `ical_uid` | text | For deduplication |
| `title`, `description`, `location` | text | |
| `start_at`, `end_at` | timestamp | Instants. Null for all-day events |
| `start_date`, `end_date` | date | All-day events only. `end_date` is **inclusive** (Google sends it exclusive; convert on write) |
| `is_all_day` | boolean | |
| `status` | text | `confirmed`, `tentative` (cancelled becomes a tombstone) |
| `transparency` | text | `opaque` (busy) or `transparent` (free) |
| `my_response` | text | `accepted`, `declined`, `tentative`, `needsAction`, or null |
| `google_visibility` | text | Google's own `default`, `public`, `private`, `confidential` |
| `visibility_override` | text | Null, `busy_only` or `private`. Owner-set, can only narrow |
| `html_link` | text | Owner only |
| `is_recurring_instance` | boolean | |
| `created_at`, `updated_at`, `deleted_at` | timestamp | `updated_at` drives the pull cursor |

All-day events use dates rather than instants so they do not shift across time zones,
the same reason `important_dates.date` is a plain date.

Indexes: unique `(calendar_id, google_event_id)`; `(user_id, updated_at)` for pull.

### `tasks.priority`

Add `priority text not null default 'normal'` (`normal` | `important`). It needs the
matching change in `@diade/validation`, the sync payload schemas, the mobile mapping and
the local SQLite table. See Milestone C.

### `events.highlighted` and `external_events.highlighted`

Migration `0004_event_highlights` adds `highlighted boolean not null default false` to both
tables. A starred event is featured in a **Highlights** card on the Today screen, for both
members.

- Díade events carry it through the normal outbox: `createEventSchema`, the event update
  payload and the sync handler all accept `highlighted`, and it is a local column.
- Google events are server-owned, so the owner sets it with `PATCH /api/calendar/events/:id`
  (`{ highlighted: boolean }`, own events only). A Google re-sync never touches it, and the
  change bumps `updated_at` so the partner's device downloads it.
- **Privacy:** `redactExternalEvent` drops the highlight for the partner unless the event is
  shared in full. A `busy_only` event or a hidden free slot never carries a star across,
  because the partner sees no title to feature. The owner's detail sheet says so.
- The Today picker ignores the calendar filters on the Calendar screen: a star is a
  deliberate choice. It lists starred events still ahead (an all-day event stays through its
  day), soonest first, up to five, looking two months ahead.

### Mobile (SQLite)

Mirror `external_calendars` (without tokens, sync tokens or locks) and `external_events`
(already redacted by the server). Neither is in `local_outbox`. The pull cursor in
`local_sync_meta` covers them.

## Visibility rules

Order from most to least open: `shared` > `busy_only` > `private`.

**Effective visibility** of an event is the most restrictive of:

1. the calendar's `visibility`
2. the event's `visibility_override`
3. `busy_only` if `google_visibility` is `private` or `confidential`
4. `private` if `my_response = 'declined'`

Rule 3 respects what the member already marked private in Google. Rule 4 stops declined
meetings cluttering the partner's view. Both can be loosened later.

**What each viewer receives from the pull endpoint:**

| Viewer | `shared` | `busy_only` | `private` |
|---|---|---|---|
| Owner | everything | everything | everything |
| Partner | everything except `html_link` | title `null` (client shows "Busy"), times, `is_all_day`, no description, location or calendar name | row sent as a tombstone, nothing else |

- Redaction is a pure function in `@diade/domain` (`redactExternalEvent`), unit tested,
  and called only in the pull handler.
- **Visibility changes must propagate.** When a calendar's visibility or an event's
  override changes, bump `updated_at` on the affected rows so the partner's next pull
  receives the narrower version, or a tombstone when it became `private`.
- `transparent` (free) events are never sent to the partner as busy blocks.

## Google OAuth

- **Connect flow.** The Settings screen calls `authClient.linkSocial` for `google` with the
  two calendar scopes and `additionalParams: { access_type: 'offline', prompt: 'consent' }`
  (`apps/mobile/src/calendar/connect.ts`). Sign-in is unchanged. The browser flow returns
  through the existing `diade://` scheme. Verified in the installed Better Auth (1.7.15)
  source: linking the same Google user updates the existing `accounts` row and merges the
  new scopes into `scope`; it does not create a second account. Success is decided by asking
  the server what it now holds, because the browser flow does not report approval.
- **Connection state** is derived: connected when the account's `scope` contains both
  calendar scopes and a refresh token exists.
- **Disconnect** soft-deletes the member's calendars and events (blanking event content), so
  both phones receive tombstones. It revokes the Google token, clears the stored tokens and
  strips the calendar scopes from the account. Signing in with Google keeps working.
  Reconnecting starts afresh at the picker.
- **Token storage.** `account.encryptOAuthTokens: true` is now on, so tokens Better Auth
  writes are encrypted with `BETTER_AUTH_SECRET`. The calendar code (`calendar/tokens.ts`)
  reads and writes tokens the same way and reads old plaintext rows as they are. There is no
  new secret. Existing plaintext rows are re-encrypted the next time that member signs in or
  connects. Limitation: Better Auth's `secrets` rotation array is not supported by the
  calendar code; this app uses a single secret.
- **Refresh.** Access tokens last about an hour. Refresh on demand with the refresh
  token. `invalid_grant` means the grant is gone: set every calendar's `last_error` to
  `needs_reauth` and show a reconnect banner.
- **Publishing status (important).** A Google OAuth consent screen in **Testing** status
  expires refresh tokens after 7 days. Move the consent screen to **In production**. With
  two users it stays unverified (a warning screen on consent, 100 user cap), which is
  acceptable for now and avoids the full Google verification review. Revisit before any
  public release.

## Sync engine (API)

Lives in `apps/api/src/calendar/` (client, mapper, engine) with routes in
`apps/api/src/routes/calendar.ts`.

### Calendar list refresh

`calendarList.list` per connected account. Upsert by `google_calendar_id` and soft-delete
calendars that disappeared (tombstoning their events).

- **Before the member has confirmed the picker**, new calendars follow Google's `selected`
  flag, are `shared`, and have `confirmed_at = null`.
- **After the first confirmation**, a calendar that appears later (new in Google, or one that
  came back) is created **switched off**, so nothing is shared by surprise. It shows up in
  Settings for the member to turn on.
- The cron refreshes the list for every connected member on each run.

### Event sync per calendar

1. **Full sync** (no `sync_token`, on 410 Gone, or when the window has gone stale):
   `events.list` with `singleEvents=true`, `showDeleted=true`,
   `timeMin = today - 30 days`, `timeMax = today + 365 days`, paged. Record
   `window_start`/`window_end` and the final `nextSyncToken`.
2. **Incremental sync**: `events.list` with `syncToken`. Google keeps the original window
   restrictions. Upsert `confirmed` and `tentative` events, tombstone `cancelled` ones.
3. **Window roll-forward.** Because the window is fixed at the last full sync, force a
   full re-baseline once the window end is less than 60 days away, or weekly.
4. A full sync tombstones any stored event in the window that Google did not return.
5. **410 Gone** discards the sync token and runs a full sync in the same call.

Mapping rules (`mapGoogleEvent`, pure and tested):

- `start.date`/`end.date` present means all-day; convert exclusive end to inclusive.
- `start.dateTime` carries an offset; store as UTC instants.
- Missing `summary` becomes an empty title (client shows "(No title)").
- `eventType` of `workingLocation`, `outOfOffice` and `focusTime` is stored with a
  `kind`-like marker only if needed; v1 skips `workingLocation` and keeps the others.
- `my_response` comes from the attendee entry with `self: true`.

### Triggers

- **Cron** every 15 minutes (`triggers.crons` in `wrangler.jsonc`) syncs every enabled
  calendar of every connected member.
- **On demand**: `POST /api/calendar/sync` from the app on foreground (at most every five
  minutes) and from the "Sync now" button. The server skips calendars synced in the last 60
  seconds.
- **After confirming the picker**, the first sync runs in the background on the server
  (`waitUntil`); the app polls until the calendars have synced, then pulls.

Each invocation processes a bounded number of calendars (start with 20) ordered by
`last_synced_at` so subrequest limits are never hit; the rest wait for the next tick.

### Concurrency

Cron and manual sync can race. Take a lease with a conditional update:
`UPDATE external_calendars SET lock_until = now() + interval '2 minutes' WHERE id = $1 AND
(lock_until IS NULL OR lock_until < now())`. If no row updates, skip. Clear the lease on
completion, success or failure.

### Failure handling

- Per-calendar failures are recorded in `last_error` and do not stop other calendars.
- 401 from Google triggers one token refresh and one retry.
- 403 `rateLimitExceeded` or 429 backs off to the next cron tick.
- Repeated failures are surfaced in Settings, never as a modal.

## API

All require a session. All act on the caller's own data unless stated.

| Method and path | Purpose |
|---|---|
| `GET /api/calendar/connection` | `{ connected, needsReauth, calendars: [...] }` for the caller |
| `POST /api/calendar/connection/refresh-calendars` | Re-run `calendarList.list` |
| `PATCH /api/calendar/calendars/:id` | Body: any of `syncEnabled`, `visibility`. Owner only |
| `PATCH /api/calendar/events/:id` | Body: `visibilityOverride` (`null`, `busy_only`, `private`). Owner only; may not widen beyond the calendar's visibility |
| `POST /api/calendar/sync` | Throttled on-demand sync |
| `DELETE /api/calendar/connection` | Disconnect and purge |

Pull (`GET /api/sync/pull`) gains `externalCalendars` and `externalEvents`:

- `externalEvents`: owner's rows unredacted; partner's rows after `redactExternalEvent`.
- `externalCalendars`: owner's calendars in full; the partner receives only `id`, `color`
  and `ownerId` for calendars whose visibility is `shared`, so a calendar name like
  "Therapy" never leaks. Colour for a partner's event falls back to a per-member colour.

Contracts go in `@diade/contracts`; request bodies in `@diade/validation`.

## Mobile UX (Android)

### Calendar settings screen (new, under Profile)

- **Not connected:** short explanation, a "Connect Google Calendar" button.
- **After consent, before any sync:** a **calendar picker** listing every calendar with
  its colour, an on/off switch (pre-set from Google's `selected`) and a visibility control
  (Shared, Busy only, Private). A line above the list says: "Shared by default. Your
  partner will see these events." A **Start syncing** button begins the first sync. This is
  the informed-default step: nothing is synced or shared until the member confirms.
- **Connected:** the same list, plus last synced time, errors per calendar, "Sync now" and
  "Disconnect".
- **Needs reauth:** banner with a "Reconnect" button.

### Calendar screen

- The agenda merges four sources into one list, grouped by day as today:
  - Díade events and Google events: timed rows, all-day rows first within the day.
  - Tasks with a due date: checkbox rows.
  - Important dates: chips in the all-day area.
- Google events show a calendar-colour stripe and, for the partner's, an owner marker.
  `busy_only` events from the partner render as "Busy" with no detail and are not
  tappable into an editor.
- Tapping your own Google event opens a **read-only detail sheet** with an "Edit in
  Google Calendar" link (`html_link`) and a visibility override control.
- A filter row: **Me / Partner / Both**, plus a toggle per own calendar.
- `AgendaItem` becomes a discriminated union on `kind`: `event`, `external_event`, `task`,
  `important_date`. `buildAgenda` takes all four lists.

### Tasks in the agenda

- A task with `due_date` appears on that local day. Task due dates are day-granular in the
  app (the form stores the end of the chosen day), so tasks show in the day's list, not at a
  time.
- Completing a task from the Calendar screen uses the existing repository write (outbox),
  exactly as on the Today screen.
- **Overdue** open tasks appear in an "Overdue" group at the top of Today and stay pinned
  there until completed or rescheduled.
- Tasks with `priority = important` sort first within their day and get a distinct
  marker, and appear in a "Needs attention" strip on Today.
- Tasks without a due date stay off the calendar.

### Duplicates

If both members connect the same calendar (shared family calendar), the same `ical_uid`
arrives twice. In the agenda, collapse events with the same `ical_uid` and start time into
one row, preferring the viewer's own copy. Hidden duplicates never change either member's
stored data.

## Privacy and security

- Default `shared` is deliberate but surprising for work calendars; the picker step makes
  it explicit before anything syncs.
- Redaction is server-side only and covered by authorisation tests.
- The server never logs event titles or descriptions; log ids and counts only.
- Disconnect revokes the Google token and deletes synced data, locally and on the server.
- Refresh tokens are encrypted at rest before release.
- The partner can never write or alter a member's synced events or settings; the REST
  routes check `user_id` on the stored row, as `sync.ts` does for personal events.

## Testing

- **Domain (`@diade/domain`)**: `redactExternalEvent` and effective-visibility resolution,
  including the narrow-only override and rules 3 and 4.
- **API mapper**: timed, all-day (exclusive to inclusive end), cancelled, tentative,
  declined, recurring instance, missing title, time zones across DST.
- **API engine (mocked `fetch`)**: full sync, incremental, 410 recovery, window
  roll-forward, token refresh, `invalid_grant`, lease contention, tombstoning on full sync.
- **Authorisation tests** next to `sync.authz.test.ts`: the partner never receives a
  `private` row's content or a `busy_only` row's title, description or location; a
  visibility change reaches the partner as a tombstone; the partner cannot call the
  owner-only routes.
- **Mobile**: `buildAgenda` with all four kinds, task day placement, overdue grouping,
  duplicate collapsing, filter behaviour.
- **Manual on an Android emulator** (argent): connect, picker, first sync, toggling a
  calendar, visibility change, disconnect, airplane mode with cached data.

## Milestones

**A. Backend sync (no UI)**
- Migration `0003`, encrypted token handling, Google client, mapper, engine, lease.
- REST routes and cron trigger.
- Mapper and engine tests.

**B. Sharing and display**
- `redactExternalEvent`, pull changes, authorisation tests.
- Mobile SQLite tables and pull handling.
- Calendar settings screen, picker step, merged agenda with filters and detail sheet.

**C. Tasks and importance**
- Tasks and important dates in the agenda, overdue grouping.
- `tasks.priority` end to end, "Needs attention" strip.

A and B ship the feature. C can ship separately, or before B if the agenda change is
useful on its own.

## Acceptance criteria

1. A member can connect Google from the app and sees all their calendars, with Google's
   `selected` calendars pre-enabled.
2. Nothing syncs until the member confirms the picker.
3. Events from every enabled calendar appear within 15 minutes of being created, edited or
   deleted in Google, and within a minute of "Sync now".
4. The partner sees `shared` events in full, `busy_only` events as "Busy" without
   details, and nothing from `private` calendars or events.
5. Narrowing visibility removes the detail from the partner's device on their next sync.
6. The Calendar screen shows events, Google events, tasks with due dates and important
   dates in one agenda, and completing a task there persists and syncs.
7. Overdue and important tasks are not lost: they stay visible until resolved.
8. Revoked access shows a reconnect banner rather than failing silently.
9. Disconnecting removes the synced data from both phones.
10. All of the above work with cached data offline, except changing settings.

## Decisions on the open questions

Taken during implementation; change them if they are wrong.

- **Non-selected Google calendars** (holidays, subscribed): follow Google's `selected` flag,
  so they start off. Calendars that appear later always start off.
- **Declined meetings**: hidden from the partner (treated as `private`), still visible to
  the owner.
- **Calendar names to the partner**: shown only when the calendar is fully `shared`.
- **Task due times**: due dates are day-granular, so tasks appear by day.
- **Google link and event details**: the partner never receives `html_link`, the owner's RSVP
  or Google's visibility flag.

## Rollout

Needed before this can run for real. None of it has been done.

1. **Google Cloud**: enable the Google Calendar API; add the scopes
   `calendar.calendarlist.readonly` and `calendar.events.readonly` to the OAuth consent screen;
   set the consent screen to **In production** (Testing mode expires refresh tokens after
   7 days). Add the OAuth redirect URI the API already uses for sign-in; linking reuses it.
2. **Deploy order matters.** Ship the app update (OTA) **before** the API. The API now sends
   `priority` on tasks and `highlighted` on events, and an older app has no such local
   columns, so its pull would fail.
   The new app copes with an older API.
3. **Database**: apply migrations `0003_calendar_sync` (two tables and `tasks.priority`) and
   `0004_event_highlights` (`highlighted` on `events` and `external_events`).
4. **Secrets**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` must be real
   on the Worker (the cron and token refresh need them). Nothing new to add.
5. **Cron**: `triggers.crons` (`*/15 * * * *`) is in `wrangler.jsonc` and deploys with the Worker.
6. **First run**: connect from the phone, check the picker, confirm, and check the partner's
   phone shows `busy_only` and `private` as described.

## Later

- Write-back (create Díade events in a chosen Google calendar) with etags and conflict
  rules.
- Google push notifications (`events.watch`) to replace the cron for freshness.
- "Free together" view from the two members' busy blocks.
- Month and week grid views.
- Device calendar provider (`expo-calendar`) for non-Google accounts.
- iOS support.
- Per-calendar colour overrides and per-occurrence handling.
- Scheduling a task as a time block on the calendar.
