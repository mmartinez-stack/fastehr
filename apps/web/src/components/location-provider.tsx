"use client"

import {
  LOCATION_FILTER_ALL,
  resolveLegacyOffice,
  type Location,
  type LocationFilter,
} from "@fastehr/contracts"
import * as React from "react"

/**
 * Which clinic the user is looking at: one of the active locations, or all
 * of them together (ADR 32; the Aug 21 sync's "unified" view). Nobody logs
 * into a location: the choice is a filter for queues and reports, and it is
 * remembered per browser so a front-desk user picks their clinic once.
 *
 * The list is a **prop, supplied by the server** through `location.list`,
 * not a constant this component reaches for. Records still carry the legacy
 * office string, and **until the clinic confirms the final location list
 * every label is that legacy string** (Sylmar, PennProgram): the selector,
 * the pick-lists, and `nameForOffice` all read `legacyName`. When the list is
 * confirmed, `labelFor` and `nameForOffice` switch to the row's `name` and
 * the pick-lists follow; nothing stored changes (ADR 32). That inversion is the point
 * (ADR 22): the browser is not the authority on what it may see, and the
 * server re-checks every location-filtered request against the actor.
 */
interface LocationContextValue {
  /** The clinic in view, or `'all'`. */
  location: LocationFilter
  /** Every clinic, in the fixed order, inactive ones included. */
  locations: readonly Location[]
  /** The clinics a filter or a pick-list offers. */
  activeLocations: readonly Location[]
  setLocation: (next: LocationFilter) => void
  /** The display name for a filter value: a clinic's name, or "All locations". */
  labelFor: (value: LocationFilter) => string
  /** The display name for a legacy office string on a record; the string itself when it names no clinic. */
  nameForOffice: (office: string | null | undefined) => string
}

const LocationContext = React.createContext<LocationContextValue | null>(null)

const STORAGE_KEY = "fastehr.location"
const ALL_LABEL = "All locations"

/**
 * The remembered choice as an external store, so the server render and the
 * hydrating client agree on "all" and the browser's value applies right
 * after — without a state update inside an effect. Storage can be missing
 * or refused (a private window, a locked-down browser); the in-memory value
 * then carries the choice for the session.
 */
const listeners = new Set<() => void>()
let inMemory: string | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? inMemory
  } catch {
    return inMemory
  }
}

function writeStored(value: string) {
  inMemory = value
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Storage unavailable: the in-memory value lasts for the session.
  }
  for (const listener of listeners) listener()
}

const serverSnapshot = () => null

export function LocationProvider({
  locations,
  children,
}: {
  locations: readonly Location[]
  children: React.ReactNode
}) {
  const activeLocations = React.useMemo(() => locations.filter((row) => row.active), [locations])
  const stored = React.useSyncExternalStore(subscribe, readStored, serverSnapshot)
  // A remembered clinic that is no longer active falls back to all.
  const location: LocationFilter =
    stored !== null && activeLocations.some((row) => row.slug === stored)
      ? (stored as LocationFilter)
      : LOCATION_FILTER_ALL

  const setLocation = React.useCallback(
    (next: LocationFilter) => {
      // Ignore a clinic the server did not list as active. Defence in depth
      // only — the request would be refused anyway — but it keeps the
      // invariant readable where the state lives.
      if (next !== LOCATION_FILTER_ALL && !activeLocations.some((row) => row.slug === next)) return
      writeStored(next)
    },
    [activeLocations],
  )

  const labelFor = React.useCallback(
    (value: LocationFilter) =>
      value === LOCATION_FILTER_ALL
        ? ALL_LABEL
        : (locations.find((row) => row.slug === value)?.legacyName ?? value),
    [locations],
  )

  // The legacy string itself, for now: the display names are seeded but not
  // shown until the clinic confirms them. The lookup stays so the switch is
  // one line here, and the mapping is exercised (a dead value has no row).
  const nameForOffice = React.useCallback(
    (office: string | null | undefined) => {
      if (office === null || office === undefined || office === "") return ""
      const slug = resolveLegacyOffice(office)?.locationSlug ?? null
      return slug === null ? office : (locations.find((row) => row.slug === slug)?.legacyName ?? office)
    },
    [locations],
  )

  return (
    <LocationContext.Provider
      value={{ location, locations, activeLocations, setLocation, labelFor, nameForOffice }}
    >
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const ctx = React.useContext(LocationContext)
  if (!ctx) throw new Error("useLocation must be used within LocationProvider")
  return ctx
}
