# Starbook

Track the starred, Bib Gourmand and guide-listed restaurants you've eaten at, and find them on a map.

**Live:** https://starbook.web.app

- A map of ~19,600 restaurants, clustered and coloured by award, with search by city or name.
- Filter by distinction, Green Star, price, cuisine, and your own list.
- Sign in with Google to log visits (date, 1–5 rating, notes), keep a wishlist, and mark favourites.
- Installable and usable offline.

Starbook is an independent project. It is not affiliated with or endorsed by Michelin.
Restaurant data comes from the community dataset
[ngshiheng/michelin-my-maps](https://github.com/ngshiheng/michelin-my-maps) (MIT).
Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Development

```bash
npm install
npm run dev            # app against the real Firebase project (use http://localhost, not 127.0.0.1)
npm test               # unit tests
```

Local Firebase emulators (needs Java 21):

```bash
npm run emulators      # terminal 1: auth + Firestore emulators
npm run dev:emulators  # terminal 2: app pointed at them
npm run test:rules     # security-rule and data-layer tests against the emulator
```

## Restaurant data

`data/registry.jsonl` is the committed source of truth: one restaurant per line, keyed by a
stable ID that saved visits refer to. `public/data/restaurants.json` is derived from it at
build time and is not committed.

```bash
npm run data           # fetch upstream, assign IDs, update the registry
```

IDs survive upstream URL changes: an unknown URL is linked to a restaurant that just
disappeared only if it has the same slug within 2 km, or the same name within 300 m, and the
match is one-to-one. Restaurants that leave the guide are kept (hidden by default) so visit
history still resolves. A refresh that would add or retire more than 5% of restaurants
stops for review; see `MAX_CHANGE_FRACTION` in `scripts/data/lib.ts` for the measurements
behind that limit.

## Deployment

- **Hosting** deploys on every push to `main` after CI passes (`.github/workflows/deploy.yml`).
- **Data** refreshes on the 5th of each month (`refresh-data.yml`), commits any change, and deploys.
  If the 5% guard trips, the run fails. Check the upstream file, then re-run it manually with
  "allow mass change" ticked.
- **Firestore rules** are deployed by hand, after `npm run test:rules` passes:
  `npx firebase deploy --only firestore:rules`.

See `BACKLOG.md` for planned work.
