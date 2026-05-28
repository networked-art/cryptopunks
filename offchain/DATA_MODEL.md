# Data model — `offchain`

All tables below live in this app's Postgres database (or sqlite in tests).
The in-repo Ponder indexer is consumed read-only via HTTP GraphQL; we do
**not** join across databases.

## `users`

| column              | type            | notes                                                       |
| ------------------- | --------------- | ----------------------------------------------------------- |
| `id`                | serial PK       |                                                             |
| `email`             | text, unique    | nullable — set on email-PIN signup or after linking         |
| `email_verified_at` | timestamptz     | set when an `auth_codes` row is consumed                    |
| `display_name`      | varchar(100)    | optional                                                    |
| `settings`          | jsonb           | `{emailEnabled, digestFrequency, quietHoursStart/End}`       |
| `created_at`        | timestamptz     |                                                             |
| `updated_at`        | timestamptz     |                                                             |

## `user_addresses`

| column                   | type         | notes                                              |
| ------------------------ | ------------ | -------------------------------------------------- |
| `id`                     | serial PK    |                                                    |
| `user_id`                | int FK       | cascades delete                                    |
| `address`                | varchar(42)  | lowercased, globally unique                        |
| `verification_message`   | text         | the EIP-4361 message that was signed                |
| `verification_signature` | text         |                                                    |
| `verified_at`            | timestamptz  |                                                    |
| `is_primary`             | bool         | partial unique index on (user_id) WHERE is_primary |

## `auth_codes`

PIN-login state. One row per user.

| column         | type        | notes                                |
| -------------- | ----------- | ------------------------------------ |
| `user_id`      | int PK + FK |                                       |
| `code`         | int         | 100000–999999                        |
| `channel`      | string      | `'email'`                            |
| `expires_at`   | timestamptz | 15 min after creation                |
| `consumed_at`  | timestamptz | set when PIN successfully exchanged  |

## `auth_access_tokens`

Standard `@adonisjs/auth` access-tokens table. Tokens are prefixed `oc_`,
expire after one year, and are also delivered as the `oc_bearer` httpOnly
cookie.

## `searches`

Persisted as the SDK's user-facing `PunkQuery` form; the matcher recompiles
each criteria via the SDK's `PunksDataset.search()` on each tick.

| column             | type         | notes                                                                        |
| ------------------ | ------------ | ---------------------------------------------------------------------------- |
| `id`               | serial PK    |                                                                              |
| `user_id`          | int FK       |                                                                              |
| `name`             | varchar(120) | human-readable                                                               |
| `criteria`         | jsonb        | `PunkQuery` from `@networked-art/punks-sdk`                                  |
| `notify`           | bool         | toggle for the match engine                                                  |
| `notify_frequency` | string       | `'immediate'` \| `'hourly'` \| `'daily'`                                     |
| `notify_sources`   | jsonb array  | indexer sources (e.g. `cryptopunks_v2`, `punks_auction`)                     |
| `notify_kinds`     | jsonb array  | indexer event kinds (e.g. `listing`, `lot_created`, `auction_started`)        |
| `max_price_wei`    | string       | optional ceiling; matches above it are dropped                               |
| `last_matched_at`  | timestamptz  | bumped by the matcher each time a match is recorded                          |

## `inquiries`

A user-initiated request that escalates a saved search into demand a
seller/admin can act on.

| column              | type        | notes                                                            |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `id`                | serial PK   |                                                                  |
| `user_id`           | int FK      |                                                                  |
| `search_id`         | int FK      | required — every inquiry points at a `searches` row              |
| `note`              | text        | optional free-text from the user                                 |
| `max_price_wei`     | string      | optional inquiry-specific budget; otherwise inherits from search |
| `status`            | string      | `'open' \| 'contacted' \| 'fulfilled' \| 'cancelled'`            |
| `status_changed_at` | timestamptz |                                                                  |

## `search_matches`

Dedupe table: at most one row per `(search_id, event_id)`. Created by the
matcher; references a `notification_deliveries` row once enqueued.

## `notification_deliveries`

Single outbox for every email this app sends downstream of the matcher and
admin actions.

| column          | type        | notes                                       |
| --------------- | ----------- | ------------------------------------------- |
| `id`            | serial PK   |                                             |
| `user_id`       | int FK      |                                             |
| `channel`       | string      | `'email'` for now                           |
| `type`          | string      | `'search_match'`, `'inquiry_status_changed'` |
| `payload`       | jsonb       | per-type details (see mailers)              |
| `dedupe_key`    | string      | globally unique                             |
| `status`        | string      | `'queued' \| 'sent' \| 'failed'`            |
| `attempt_count` | int         |                                             |
| `last_error`    | text        | last error message (if any)                 |
| `queued_at`     | timestamptz |                                             |
| `sent_at`       | timestamptz |                                             |
| `failed_at`     | timestamptz |                                             |

## `indexer_cursor`

Resumable cursor for the match engine; key `search_matcher` tracks the
highest indexer block/log seen.
