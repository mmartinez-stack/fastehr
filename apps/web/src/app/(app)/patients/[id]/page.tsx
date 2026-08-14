import { notFound } from "next/navigation"

import {
  appointmentsForPatient,
  getPatient,
  pendingWaivers,
  visitsForPatient,
} from "@/lib/mock-data"
import { PatientDetail } from "./patient-detail"

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const patient = getPatient(id)
  if (!patient) notFound()

  // Which half of this the reader sees is a client-side role switch in the
  // mockup, so everything is loaded here and the view decides. That inverts
  // once roles are real: the server will decide, and it will not send the
  // clerical half to a provider at all.
  return (
    <PatientDetail
      patient={patient}
      visits={visitsForPatient(id)}
      appointments={appointmentsForPatient(id)}
      waivers={pendingWaivers().filter((w) => w.patientId === id)}
    />
  )
}
