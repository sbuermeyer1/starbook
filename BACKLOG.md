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
