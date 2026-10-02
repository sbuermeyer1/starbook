// Refresh restaurant data from the community dataset.
//
//   node scripts/build-data.ts [--csv <file>] [--date YYYY-MM-DD] [--dry-run] [--allow-mass-change]
//   node scripts/build-data.ts --client-only
//
// Reads data/registry.jsonl (the ID registry, one restaurant per line, committed),
// writes it back, and writes public/data/restaurants.json for the client. That file is
// derived, so it isn't committed: --client-only regenerates it from the registry
// (run before every build) without fetching anything.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import Papa from 'papaparse'
import { dedupeListings, massChangeProblems, MAX_CHANGE_FRACTION, normalizeRow, resolve, toClientPayload } from './data/lib.ts'
import type { CsvRow, Restaurant } from './data/lib.ts'

const SOURCE_URL = 'https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv'
const ROOT = path.resolve(import.meta.dirname, '..')
const REGISTRY = path.join(ROOT, 'data', 'registry.jsonl')
const CLIENT_OUT = path.join(ROOT, 'public', 'data', 'restaurants.json')

const { values: args } = parseArgs({
  options: {
    csv: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    'allow-mass-change': { type: 'boolean', default: false },
    'client-only': { type: 'boolean', default: false },
  },
})

async function readCsv(): Promise<string> {
  if (args.csv) return fs.readFileSync(args.csv, 'utf8')
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL}: HTTP ${res.status}`)
  return res.text()
}

function readRegistry(): Restaurant[] {
  if (!fs.existsSync(REGISTRY)) return []
  return fs.readFileSync(REGISTRY, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function writeClient(restaurants: Restaurant[], snapshot: string) {
  fs.mkdirSync(path.dirname(CLIENT_OUT), { recursive: true })
  fs.writeFileSync(CLIENT_OUT, JSON.stringify(toClientPayload(restaurants, snapshot)))
  console.log(`wrote ${path.relative(ROOT, CLIENT_OUT)} (${(fs.statSync(CLIENT_OUT).size / 1e6).toFixed(2)} MB)`)
}

if (args['client-only']) {
  const registry = readRegistry()
  if (!registry.length) throw new Error(`${path.relative(ROOT, REGISTRY)} is missing or empty; run a full refresh first`)
  // The snapshot date is the latest listing date in the registry.
  writeClient(registry, registry.reduce((d, r) => (r.lastSeen > d ? r.lastSeen : d), ''))
  process.exit(0)
}

const parsed = Papa.parse<CsvRow>(await readCsv(), { header: true, skipEmptyLines: true })
if (parsed.errors.length) throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 5))}`)
const { listings, dropped } = dedupeListings(parsed.data.map(normalizeRow))
for (const p of dropped) console.log(`  dropped an identical duplicate of ${p}`)

const registry = readRegistry()
const { restaurants, report } = resolve(registry, listings, args.date!)

const activeBefore = registry.filter((r) => r.inGuide).length
console.log(`snapshot ${args.date}: ${listings.length} listed, registry ${registry.length} (${activeBefore} active)`)
console.log(`  kept ${report.kept}, relinked ${report.relinked.length}, added ${report.added}, retired ${report.retired}, award changes ${report.awardChanges.length}`)
for (const r of report.relinked) console.log(`  relinked [${r.rule}] ${r.id}: ${r.from} -> ${r.to}`)
for (const p of report.ambiguous) console.log(`  ambiguous, given a fresh ID: ${p}`)

const problems = massChangeProblems(report, activeBefore)
if (problems.length && !args['allow-mass-change']) {
  for (const p of problems) console.error(`refusing: ${p}, over the ${MAX_CHANGE_FRACTION * 100}% limit`)
  console.error('Check the upstream file. If the change is real, rerun with --allow-mass-change.')
  process.exit(1)
}

if (args['dry-run']) process.exit(0)

fs.mkdirSync(path.dirname(REGISTRY), { recursive: true })
fs.writeFileSync(REGISTRY, restaurants.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log(`wrote ${path.relative(ROOT, REGISTRY)}`)
writeClient(restaurants, args.date!)
