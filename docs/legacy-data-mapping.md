# Legacy data mapping

Per-collection mapping from the legacy system to the FastEHR schema. **Structure
only** — each section is filled in per-module as that module is migrated.

## Ground rules

**`legacyId String @unique` on every migrated table.** It holds the source
system's document id. Imports are therefore idempotent and re-runnable: an
importer upserts on `legacyId`, so a re-run after a partial failure converges
instead of duplicating. Migration is not a single cutover event — expect to
re-run a collection many times while mapping decisions are still settling.

**Importers read externally-produced NDJSON.** Extraction is somebody else's
job, upstream, and its output is a file. Each record is validated through a
`@fastehr/contracts` Zod schema before it reaches the database, so a shape
change in the source is a loud parse failure at a known line rather than a
silent bad row.

**No MongoDB driver or extraction code ever enters this repository.** Not as a
dependency, not as a script, not "temporarily". The repo's contract with the
legacy system is the NDJSON file format and nothing else; that is what keeps the
legacy system's lifetime decoupled from this one's.

Importers live in `packages/db`.

---

## `<collection-name>`

> Copy this block per collection.

### Source collection → target table

| Source | Target |
| ------ | ------ |
| `<legacy.collection>` | `<schema.Model>` |

### Field mapping

| Source field | Target column | Type | Notes |
| ------------ | ------------- | ---- | ----- |
| `_id` | `legacyId` | `String @unique` | Always. Import key. |
| | | | |

### Transform decisions

- <normalisation, unit conversion, splitting or merging fields, defaults for
  records that predate a field, how ambiguous values are resolved>

### Discarded fields

| Source field | Why discarded |
| ------------ | ------------- |
| | |

> Record fields deliberately dropped, and why. A field absent from both this
> table and the mapping above is an oversight, not a decision.
