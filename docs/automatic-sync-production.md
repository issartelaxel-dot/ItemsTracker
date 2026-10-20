# Automatic saving — production rollout, 20 October 2026

The API enables automatic saving by default. `AUTOMATIC_SYNC_ENABLED=false`
remains an explicit server override. Production frontend builds enable
`VITE_AUTOMATIC_SYNC=true`. The API health response reports `automaticSync`.

Changes are additive: three operation/history/delivery tables, existing state
transactions, durable IndexedDB operation IDs and automatic reconciliation.
Existing legacy state routes remain available for already-open older clients.
Separate fields merge; concurrent scalar values use server acceptance order;
deletion prevents stale recreation; reviews add once; replaced media/text are
recoverable in Settings. Retries keep the same operation IDs.

Before rollout, the production database was dumped and restored into an isolated
database. All 33 tables restored successfully; fingerprints of the six user-data
tables matched live production (5 users and 2,905 cards). Encryption was verified
by decrypting and hashing every dump byte. No history-pruning maintenance ran.

Backup directory on the deployment host:
`/var/backups/itemstracker-automatic-sync-20261020T161303Z`.
It contains the database, verification manifest, and frontend before deployment.
The encryption key is separately protected under
`/root/.config/itemstracker-production-backup-20261020`.
Previous source: `b7c9b50931471b6e12eb1aa7c2f7184fdc821e3a`.
Previous frontend image: `itemstracker-production-before-autosync:20261020`.

Roll out API first, verify health and authenticated operation endpoints, then
deploy the frontend through its existing Coolify application. The frontend's
automatic deployment is held during the API rollout and restored afterward.

For rollback, restore the old frontend image/files while keeping the new API
available: it accepts both protocols, including queues from newer clients that
are still open. Leave the additive tables and accepted operations in place.
A database restore is a disaster-recovery action, not a routine code rollback:
it would otherwise discard user changes accepted since the backup. Retain the
old API source for a server rollback, and preserve pending client queues if that
last resort is needed. Do not remove the operation tables or delete browser data.

Browsers can suspend background timers. Updates resume automatically on focus
or network return. Initial page loading still needs the network; pending edits
are retained locally across reloads. WebKit phone tests emulate a mobile device.
