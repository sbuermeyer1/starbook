// Refresh restaurant data from the community dataset.
//
//   node scripts/build-data.ts [--csv <file>] [--date YYYY-MM-DD] [--dry-run] [--allow-mass-retire]
//
// Reads data/registry.jsonl (the ID registry, one restaurant per line, committed),
// writes it back, and writes public/data/restaurants.json for the client.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import Papa from 'papaparse'
import { normalizeRow, resolve, toClientPayload } from './data/lib.ts'
import type { CsvRow, Restaurant } from './data/lib.ts'

const SOURCE_URL = 'https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv'
const ROOT = path.resolve(import.meta.dirname, '..')
const REGISTRY = path.join(ROOT, 'data', 'registry.jsonl')
const CLIENT_OUT = path.join(ROOT, 'public', 'data', 'restaurants.json')

// A truncated or broken upstream file would otherwise retire most of the guide.
// Measured monthly churn is ~0.5%; a full year across a guide cycle was ~11%.
const MAX_RETIRE_FRACTION = 0.05

const { values: args } = parseArgs({
  options: {
    csv: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    'allow-mass-retire': { type: 'boolean', default: false },
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

const parsed = Papa.parse<CsvRow>(await readCsv(), { header: true, skipEmptyLines: true })
if (parsed.errors.length) throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 5))}`)
const listings = parsed.data.map(normalizeRow)

const registry = readRegistry()
const { restaurants, report } = resolve(registry, listings, args.date!)

const activeBefore = registry.filter((r) => r.inGuide).length
console.log(`snapshot ${args.date}: ${listings.length} listed, registry ${registry.length} (${activeBefore} active)`)
console.log(`  kept ${report.kept}, relinked ${report.relinked.length}, added ${report.added}, retired ${report.retired}, award changes ${report.awardChanges.length}`)
for (const r of report.relinked) console.log(`  relinked [${r.rule}] ${r.id}: ${r.from} -> ${r.to}`)
for (const p of report.ambiguous) console.log(`  ambiguous, given a fresh ID: ${p}`)

if (activeBefore > 0 && report.retired / activeBefore > MAX_RETIRE_FRACTION && !args['allow-mass-retire']) {
  console.error(`refusing: would retire ${report.retired} of ${activeBefore} (> ${MAX_RETIRE_FRACTION * 100}%). Check the source, then pass --allow-mass-retire.`)
  process.exit(1)
}

if (args['dry-run']) process.exit(0)

fs.mkdirSync(path.dirname(REGISTRY), { recursive: true })
fs.writeFileSync(REGISTRY, restaurants.map((r) => JSON.stringify(r)).join('\n') + '\n')
fs.mkdirSync(path.dirname(CLIENT_OUT), { recursive: true })
fs.writeFileSync(CLIENT_OUT, JSON.stringify(toClientPayload(restaurants, args.date!)))
console.log(`wrote ${path.relative(ROOT, REGISTRY)} and ${path.relative(ROOT, CLIENT_OUT)} (${(fs.statSync(CLIENT_OUT).size / 1e6).toFixed(2)} MB)`)
