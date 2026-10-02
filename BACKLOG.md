# Backlog

## Award as of the visit date (not as of logging)

**Now:** a visit stores the restaurant's award and Green Star as listed *when the visit
is logged*. Logging a 2023 dinner today records today's award, so the "was 1★ · now 2★"
badge only appears for visits logged before an award change.

**Plan:** build an award history from the upstream dataset's git history
(`ngshiheng/michelin-my-maps`, monthly snapshots back to at least 2024-09; check the
true start). Run each snapshot through the pipeline's ID resolution so history follows
the registry IDs, and store `{id: [[fromDate, award, green], ...]}` as a static file.
When a visit has a date inside the covered window, look up the award for that date.
Otherwise, fall back to the stored award.

No stored data changes: `award`/`green` on visits remain the fallback, and the lookup
happens at display time.

## "New version available" banner

**Problem:** the service worker serves the previously cached build first, so after a
deploy people run the old version until they reopen the app (twice, in practice). This
made the phone sign-in fix look broken on its first retry.

**Plan:** use vite-plugin-pwa's prompt mode (`registerType: 'prompt'`, `useRegisterSW`)
and show a small "New version available, tap to refresh" banner. Don't auto-reload: it
could throw away a half-written visit note.

## Check the first automatic data refresh (2026-10-05)

The monthly `refresh-data.yml` run hasn't happened yet. On the 5th, check GitHub Actions.
If it failed, read the log first: the likeliest cause is the 5% guard catching a large
upstream change (see `MAX_CHANGE_FRACTION`). Check the upstream file, then re-run it with
"allow mass change" only if the change is real.

## A cleaner map style

The map uses OpenStreetMap's standard tiles: busy behind the pins, and OSM's tile policy
discourages heavy use by public apps. Consider a lighter basemap such as CARTO Positron or
Voyager, or Stadia, under their terms (check free-tier limits and attribution). It's a
one-line change to the `TileLayer` URL and attribution in `src/map/MapView.tsx`.

## Home-screen install and offline on the owner's phone

Both work in desktop Chrome (verified with the server stopped), but neither works on the
owner's phone. Deprioritized by the owner. Next step: find out the phone and browser.
iOS Safari has no install prompt (Share → Add to Home Screen), and a home-screen app keeps
its own storage, separate from the browser's.
