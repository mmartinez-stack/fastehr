import type { StaffRole } from "@fastehr/contracts"

import { surfacesFor } from "@/components/role-provider"

/**
 * The patient record's three tabs (DIA-52 as restated 2026-09-07, ADR 28):
 * Medical first and default, then Patient Info, then Billing. The list is
 * the layout, identical on the create, edit, and intake screens and for
 * every role. A role decides only which of the three render.
 *
 * `patientTabsFor` is the one place that decision is made on the client,
 * derived from the same surfaces the navigation uses; the server enforces
 * the same split per section (`patient.byId` is the Medical tab's data,
 * `patient.demographics` the Patient Info tab's, `patient.billing` the
 * Billing tab's; see the roles matrix). A page never asks `role === …`.
 */
export const PATIENT_TABS = ["medical", "patientInfo", "billing"] as const
export type PatientTab = (typeof PATIENT_TABS)[number]

export const PATIENT_TAB_LABEL: Record<PatientTab, string> = {
  medical: "Medical",
  patientInfo: "Patient Info",
  billing: "Billing",
}

/** The tabs a role renders, in the fixed order. */
export function patientTabsFor(role: StaffRole): readonly PatientTab[] {
  const surfaces = surfacesFor(role)
  return PATIENT_TABS.filter((tab) =>
    tab === "medical" ? surfaces.clinical : surfaces.clerical,
  )
}

/** The self-service intake and its review: no Billing, ever (ADR 29). */
export const INTAKE_TABS: readonly PatientTab[] = ["medical", "patientInfo"]
