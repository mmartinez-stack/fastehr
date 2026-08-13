// Centralized mock data for the iCardio EHR mockup. No backend — everything here
// is deterministic, plausible clinical data used across the app.

export type Office = "Downtown" | "Eastside" | "At Home"
export type Language = "ENG" | "SPA"
export type PatientStatus = "active" | "inactive"
export type ApptType = "Initial" | "Follow-up" | "At-Home"

export const OFFICES: Office[] = ["Downtown", "Eastside", "At Home"]
export const PROVIDERS = [
  "Dr. Nguyen",
  "Dr. Alvarez",
  "NP Carter",
  "Dr. Patel",
] as const
export const MEDICATIONS = [
  "Semaglutide",
  "Tirzepatide",
  "Lipoden",
  "B12",
  "Phentermine",
] as const
export const CONSENT_TYPES = [
  "Treatment",
  "Lipoden",
  "Testimonial",
  "Ozempic",
  "Semaglutide",
  "Tirzepatide",
  "Botox",
  "Home Contract",
] as const

export interface MedDose {
  name: string
  dosage: string
}

export interface Coupon {
  description: string
  validUntil: string
}

export interface Visit {
  id: string
  patientId: string
  date: string // ISO date
  type: ApptType
  weight: number // lbs
  meds: MedDose[]
  provider: string
  signed: boolean
  signedBy?: string
  signedAt?: string // ISO datetime
  openedAt?: string // ISO datetime
  tracking?: string
  paymentMethod: "Cash" | "Card" | "Zelle" | "Insurance"
  amount: number
  paid: boolean
  notes: string
  photo: boolean
}

export interface Patient {
  id: string
  firstName: string
  lastName: string
  dob: string
  gender: "Male" | "Female"
  heightIn: number
  phone: string
  email: string
  address: { street: string; city: string; state: string; zip: string }
  office: Office
  language: Language
  status: PatientStatus
  referralSource: string
  atHome: boolean
  program?: string
  medsHistory: string
  lastVisit: string
  missingConsents: string[]
  coupons: Coupon[]
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  start: string // ISO datetime
  end: string
  type: ApptType
  provider: string
  interestedIn?: string
  notes: string
}

export interface SmsMessage {
  id: string
  direction: "in" | "out"
  text: string
  time: string
}

export interface SmsThread {
  id: string
  patientId: string
  patientName: string
  phone: string
  lastMessage: string
  timestamp: string
  unread: boolean
  messages: SmsMessage[]
}

export interface RefillRequest {
  id: string
  patientId: string
  patientName: string
  dob: string
  language: Language
  date: string
  medication: string
  dosage: string
  notes: string
  signed: boolean
}

export interface Callback {
  id: string
  date: string
  patientId: string
  patientName: string
  phone: string
  reason: string
  notes: string
  assignedTo: string
  done: boolean
}

export interface RfiEntry {
  id: string
  date: string
  name: string
  phone: string
  email: string
  program: string
  source: string
  status: "New" | "Contacted" | "Scheduled"
  message: string
  followups: { time: string; note: string }[]
}

export interface StartTreatment {
  id: string
  date: string
  name: string
  phone: string
  email: string
  program: string
  status: "New" | "Contacted" | "Scheduled"
  notes: string
  address: string
  heardFrom: string
  goalWeight: number
}

export interface StaffUser {
  id: string
  name: string
  username: string
  email: string
  role: "Admin" | "Provider" | "MA" | "Front Desk"
  office: Office
  active: boolean
}

export interface Macro {
  shortcut: string
  expansion: string
}

// ---- helpers ---------------------------------------------------------------

function iso(daysAgo: number, hour = 10, minute = 0): string {
  const d = new Date(2025, 7, 4, hour, minute, 0) // Aug 4 2025 anchor
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export function fmtDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function fmtDateLong(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function fmtDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function bmi(weightLbs: number, heightIn: number): number {
  if (!heightIn) return 0
  return Math.round(((weightLbs / (heightIn * heightIn)) * 703) * 100) / 100
}

export function ageFromDob(dob: string): number {
  const b = new Date(dob)
  const now = new Date(2025, 7, 4)
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function fullName(p: Pick<Patient, "firstName" | "lastName">): string {
  return `${p.firstName} ${p.lastName}`
}

// ---- patients --------------------------------------------------------------

const firstNamesEng = [
  "James", "Sarah", "Michael", "Linda", "Robert", "Patricia", "David", "Jennifer",
]
const firstNamesSpa = [
  "Maria", "Jose", "Carmen", "Luis", "Sofia", "Miguel", "Elena",
]
const lastNamesEng = [
  "Anderson", "Thompson", "Roberts", "Walker", "Bennett", "Coleman", "Foster", "Hughes",
]
const lastNamesSpa = [
  "Gonzalez", "Ramirez", "Torres", "Flores", "Herrera", "Castillo", "Vargas",
]
const cities = ["Riverside", "Fontana", "Ontario", "Corona", "Pomona"]
const referralSources = [
  "Google", "Instagram", "Friend Referral", "Facebook", "Walk-in", "Yelp",
]

function makePatients(): Patient[] {
  const out: Patient[] = []
  for (let i = 0; i < 15; i++) {
    const spanish = i % 3 === 1
    const female = i % 2 === 0
    const first = spanish
      ? firstNamesSpa[i % firstNamesSpa.length]
      : firstNamesEng[i % firstNamesEng.length]
    const last = spanish
      ? lastNamesSpa[i % lastNamesSpa.length]
      : lastNamesEng[i % lastNamesEng.length]
    const office = OFFICES[i % 3]
    const atHome = office === "At Home"
    const inactive = i === 4 || i === 11
    const missing = CONSENT_TYPES.filter((_, ci) => (i + ci) % 5 === 0).slice(0, 3)
    const year = 1962 + ((i * 7) % 40)
    const month = ((i * 5) % 12) + 1
    const day = ((i * 3) % 27) + 1
    out.push({
      id: `p${i + 1}`,
      firstName: first,
      lastName: last,
      dob: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      gender: female ? "Female" : "Male",
      heightIn: 60 + ((i * 2) % 15),
      phone: `(951) 555-${String(1000 + i * 7).slice(0, 4)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@email.com`,
      address: {
        street: `${120 + i * 13} ${["Oak", "Palm", "Maple", "Cedar", "Birch"][i % 5]} St`,
        city: cities[i % cities.length],
        state: "CA",
        zip: `9${2500 + i}`,
      },
      office,
      language: spanish ? "SPA" : "ENG",
      status: inactive ? "inactive" : "active",
      referralSource: referralSources[i % referralSources.length],
      atHome,
      program: atHome ? "At-Home GLP-1" : undefined,
      medsHistory:
        "HTN, mild hyperlipidemia. No known drug allergies. Prior trial of phentermine with good tolerance.",
      lastVisit: iso((i % 6) + 1),
      missingConsents: missing,
      coupons:
        i % 2 === 0
          ? [
              {
                description: "$50 off next Semaglutide refill",
                validUntil: "2025-09-30",
              },
              {
                description: "Free B12 with visit",
                validUntil: "2025-08-31",
              },
            ]
          : [
              {
                description: "10% off Tirzepatide package",
                validUntil: "2025-10-15",
              },
            ],
    })
  }
  return out
}

export const patients: Patient[] = makePatients()

// ---- visits ----------------------------------------------------------------

const FOLLOWUP_NOTES = [
  "Phone Note: Refill Request. Any side effects to medications? No. New medical issues since last visit? No. Current weight confirmed. Blood pressure under good control? Yes. Pt requesting 4 weeks of medication. Plan: continue current dose, 1-2 day fast with electrolytes, eating window 12-6pm. Advised more protein and vegetables, 1 gallon water daily, weekly weight check at home. RTC in 4 weeks.",
  "Tolerating medication well. No adverse effects reported. Reviewed diet log — compliant with low-carb plan. Continue titration; recheck in 2 weeks. Refill / Payment due next Monday. F/U scheduled.",
  "Text sent to schedule appointment. Refill / Payment due Tuesday. Pt reports good energy, mild nausea resolving. Continue current regimen. F/U in 2 weeks.",
  "At-home follow-up. Weight check completed, reviewed injection technique. No injection-site reactions. Advised hydration and protein intake. Continue titration, RTC 4 weeks.",
  "Weight check + refill. Pt tolerating well, no new complaints. Increased dose per titration schedule. Discussed plateau strategies. Continue plan, recheck in 2 weeks.",
]

function makeVisits(): Visit[] {
  const out: Visit[] = []
  patients.forEach((p, pi) => {
    const startWeight = 210 + ((pi * 11) % 60)
    for (let v = 0; v < 10; v++) {
      const weight = Math.round((startWeight - v * (2 + (pi % 3))) * 10) / 10
      const daysAgo = (9 - v) * 14 + (pi % 5)
      const type: ApptType =
        v === 0 ? "Initial" : p.atHome ? "At-Home" : "Follow-up"
      const medName = MEDICATIONS[(pi + v) % MEDICATIONS.length]
      const signed = v > 0
      const amount = 120 + ((pi + v) % 5) * 20
      out.push({
        id: `v${pi + 1}-${v + 1}`,
        patientId: p.id,
        date: iso(daysAgo),
        type,
        weight,
        meds: [
          { name: medName, dosage: `${0.25 * (((v % 4) + 1))} mg` },
          ...(v % 2 === 0 ? [{ name: "B12", dosage: "1 mL" }] : []),
        ],
        provider: PROVIDERS[(pi + v) % PROVIDERS.length],
        signed,
        signedBy: signed ? PROVIDERS[(pi + v) % PROVIDERS.length] : undefined,
        signedAt: signed ? iso(daysAgo - 2) : undefined,
        openedAt: iso(daysAgo),
        tracking:
          type === "At-Home" && v % 2 === 0
            ? `9405511105${String(500000000 + (pi * 97 + v * 13) * 3571).slice(0, 9)}`
            : undefined,
        paymentMethod: (["Cash", "Card", "Zelle", "Insurance"] as const)[
          (pi + v) % 4
        ],
        amount,
        paid: !(v === 0 && pi % 4 === 0),
        notes:
          v === 0
            ? "Initial consult. Reviewed goals and medical history. Started GLP-1 titration. Discussed diet, hydration, and expected side effects. Welcome package to be sent. Baseline weight recorded. Goal weight discussed. RTC in 2 weeks."
            : FOLLOWUP_NOTES[(pi + v) % FOLLOWUP_NOTES.length],
        photo: v % 3 === 0,
      })
    }
  })
  return out
}

export const visits: Visit[] = makeVisits()

export function visitsForPatient(patientId: string): Visit[] {
  return visits
    .filter((v) => v.patientId === patientId)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
}

export function getPatient(id: string): Patient | undefined {
  return patients.find((p) => p.id === id)
}

// ---- appointments ----------------------------------------------------------

// Week of Aug 4–10 2025 (Mon–Sun). Times within 8:00–19:00.
function apptISO(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(2025, 7, 4, hour, minute, 0) // Mon Aug 4
  d.setDate(d.getDate() + dayOffset)
  return d.toISOString()
}

export const appointments: Appointment[] = [
  {
    id: "a1",
    patientId: "p1",
    patientName: fullName(patients[0]),
    start: apptISO(0, 9),
    end: apptISO(0, 9, 45),
    type: "Follow-up",
    provider: "Dr. Nguyen",
    notes: "Weight check + refill.",
  },
  {
    id: "a2",
    patientId: "p2",
    patientName: fullName(patients[1]),
    start: apptISO(0, 11),
    end: apptISO(0, 12),
    type: "Initial",
    provider: "Dr. Alvarez",
    interestedIn: "Tirzepatide program",
    notes: "New patient consult. Spanish-speaking.",
  },
  {
    id: "a3",
    patientId: "p3",
    patientName: fullName(patients[2]),
    start: apptISO(1, 10),
    end: apptISO(1, 11),
    type: "At-Home",
    provider: "NP Carter",
    notes: "At-home follow-up visit.",
  },
  {
    id: "a4",
    patientId: "p4",
    patientName: fullName(patients[3]),
    start: apptISO(1, 14),
    end: apptISO(1, 14, 45),
    type: "Follow-up",
    provider: "Dr. Patel",
    notes: "Recheck labs.",
  },
  {
    id: "a5",
    patientId: "p5",
    patientName: fullName(patients[4]),
    start: apptISO(2, 8, 30),
    end: apptISO(2, 9, 30),
    type: "Initial",
    provider: "Dr. Nguyen",
    interestedIn: "Semaglutide program",
    notes: "Consult.",
  },
  {
    id: "a6",
    patientId: "p6",
    patientName: fullName(patients[5]),
    start: apptISO(2, 13),
    end: apptISO(2, 13, 45),
    type: "Follow-up",
    provider: "Dr. Alvarez",
    notes: "Titration adjustment.",
  },
  {
    id: "a7",
    patientId: "p7",
    patientName: fullName(patients[6]),
    start: apptISO(3, 10, 30),
    end: apptISO(3, 11, 15),
    type: "Follow-up",
    provider: "NP Carter",
    notes: "B12 + weight check.",
  },
  {
    id: "a8",
    patientId: "p8",
    patientName: fullName(patients[7]),
    start: apptISO(4, 15),
    end: apptISO(4, 16),
    type: "At-Home",
    provider: "Dr. Patel",
    notes: "At-home injection teaching.",
  },
  {
    id: "a9",
    patientId: "p9",
    patientName: fullName(patients[8]),
    start: apptISO(4, 9),
    end: apptISO(4, 9, 45),
    type: "Follow-up",
    provider: "Dr. Nguyen",
    notes: "Refill review.",
  },
]

// ---- SMS -------------------------------------------------------------------

export const smsThreads: SmsThread[] = [
  {
    id: "s1",
    patientId: "p2",
    patientName: fullName(patients[1]),
    phone: patients[1].phone,
    lastMessage: "Hola, necesito reprogramar mi cita del jueves.",
    timestamp: iso(0, 9, 12),
    unread: true,
    messages: [
      { id: "m1", direction: "out", text: "Hi Maria, this is iCardio. Your appointment is confirmed for Thursday at 11:00 AM.", time: iso(1, 15, 0) },
      { id: "m2", direction: "in", text: "Gracias! Pero tengo una pregunta.", time: iso(1, 16, 30) },
      { id: "m3", direction: "in", text: "Hola, necesito reprogramar mi cita del jueves.", time: iso(0, 9, 12) },
    ],
  },
  {
    id: "s2",
    patientId: "p1",
    patientName: fullName(patients[0]),
    phone: patients[0].phone,
    lastMessage: "Thanks! See you then.",
    timestamp: iso(0, 8, 40),
    unread: false,
    messages: [
      { id: "m1", direction: "in", text: "Is my refill ready for pickup?", time: iso(0, 8, 10) },
      { id: "m2", direction: "out", text: "Yes! Your Semaglutide refill is ready at the Downtown office.", time: iso(0, 8, 30) },
      { id: "m3", direction: "in", text: "Thanks! See you then.", time: iso(0, 8, 40) },
    ],
  },
  {
    id: "s3",
    patientId: "p6",
    patientName: fullName(patients[5]),
    phone: patients[5].phone,
    lastMessage: "Reminder: your visit is tomorrow at 1:00 PM.",
    timestamp: iso(1, 13, 0),
    unread: false,
    messages: [
      { id: "m1", direction: "out", text: "Reminder: your visit is tomorrow at 1:00 PM.", time: iso(1, 13, 0) },
    ],
  },
  {
    id: "s4",
    patientId: "p7",
    patientName: fullName(patients[6]),
    phone: patients[6].phone,
    lastMessage: "Can I switch to the monthly plan?",
    timestamp: iso(2, 11, 20),
    unread: true,
    messages: [
      { id: "m1", direction: "in", text: "Can I switch to the monthly plan?", time: iso(2, 11, 20) },
    ],
  },
]

export const SMS_TEMPLATES = [
  { label: "Appointment reminder", text: "Reminder: your iCardio appointment is coming up. Reply C to confirm or R to reschedule." },
  { label: "Refill ready", text: "Your refill is ready for pickup at your iCardio office." },
  { label: "Lab results", text: "Your recent lab results are in. Please call us to review." },
  { label: "Welcome", text: "Welcome to iCardio! We're glad to have you. Let us know if you have any questions." },
]

// ---- refill requests -------------------------------------------------------

export const refillRequests: RefillRequest[] = patients
  .slice(0, 6)
  .map((p, i) => ({
    id: `r${i + 1}`,
    patientId: p.id,
    patientName: fullName(p),
    dob: p.dob,
    language: p.language,
    date: iso(i),
    medication: MEDICATIONS[i % MEDICATIONS.length],
    dosage: `${0.5 * ((i % 3) + 1)} mg`,
    notes:
      i % 2 === 0
        ? "Patient requests same dose. Tolerating well."
        : "Wants to increase dose next cycle.",
    signed: i > 3,
  }))

// ---- callbacks -------------------------------------------------------------

export const callbacks: Callback[] = patients.slice(0, 7).map((p, i) => ({
  id: `c${i + 1}`,
  date: iso(i),
  patientId: p.id,
  patientName: fullName(p),
  phone: p.phone,
  reason: [
    "Side effect question",
    "Billing question",
    "Reschedule",
    "Prior auth follow-up",
    "Missed appointment",
    "Refill status",
    "General question",
  ][i],
  notes: "",
  assignedTo: PROVIDERS[i % PROVIDERS.length],
  done: i === 5,
}))

// ---- RFI -------------------------------------------------------------------

export const rfiEntries: RfiEntry[] = [
  {
    id: "rfi1",
    date: iso(0),
    name: "Olivia Martin",
    phone: "(951) 555-2244",
    email: "olivia.martin@email.com",
    program: "Semaglutide",
    source: "Instagram",
    status: "New",
    message: "How much does the monthly program cost and do you take insurance?",
    followups: [],
  },
  {
    id: "rfi2",
    date: iso(1),
    name: "Daniel Reyes",
    phone: "(951) 555-9931",
    email: "daniel.reyes@email.com",
    program: "Tirzepatide",
    source: "Google",
    status: "Contacted",
    message: "Interested in the at-home program. What areas do you serve?",
    followups: [{ time: iso(0, 14), note: "Left voicemail, will try again tomorrow." }],
  },
  {
    id: "rfi3",
    date: iso(3),
    name: "Grace Kim",
    phone: "(951) 555-7712",
    email: "grace.kim@email.com",
    program: "Lipoden",
    source: "Facebook",
    status: "Scheduled",
    message: "Booked a consult for next week, looking forward to it!",
    followups: [
      { time: iso(2, 10), note: "Called back, answered questions." },
      { time: iso(2, 11), note: "Scheduled initial consult." },
    ],
  },
]

// ---- start treatment -------------------------------------------------------

export const startTreatment: StartTreatment[] = [
  {
    id: "st1",
    date: iso(0),
    name: "Emily Carter",
    phone: "(951) 555-3321",
    email: "emily.carter@email.com",
    program: "Semaglutide",
    status: "New",
    notes: "",
    address: "845 Palm Ave, Riverside, CA 92501",
    heardFrom: "Instagram ad",
    goalWeight: 150,
  },
  {
    id: "st2",
    date: iso(1),
    name: "Marcus Bell",
    phone: "(951) 555-6654",
    email: "marcus.bell@email.com",
    program: "Tirzepatide",
    status: "Contacted",
    notes: "Reached out, waiting on insurance info.",
    address: "210 Cedar St, Fontana, CA 92335",
    heardFrom: "Friend referral",
    goalWeight: 205,
  },
  {
    id: "st3",
    date: iso(2),
    name: "Ana Delgado",
    phone: "(951) 555-8890",
    email: "ana.delgado@email.com",
    program: "At-Home GLP-1",
    status: "Scheduled",
    notes: "Consult booked for Aug 12.",
    address: "77 Maple St, Ontario, CA 91762",
    heardFrom: "Google search",
    goalWeight: 170,
  },
  {
    id: "st4",
    date: iso(4),
    name: "Tyler Brooks",
    phone: "(951) 555-1123",
    email: "tyler.brooks@email.com",
    program: "Lipoden",
    status: "New",
    notes: "",
    address: "512 Oak St, Corona, CA 92879",
    heardFrom: "Yelp",
    goalWeight: 190,
  },
]

export function getStartTreatment(id: string): StartTreatment | undefined {
  return startTreatment.find((s) => s.id === id)
}

// ---- staff / users ---------------------------------------------------------

export const staffUsers: StaffUser[] = [
  { id: "u1", name: "Dr. Kevin Nguyen", username: "knguyen", email: "k.nguyen@icardio.com", role: "Provider", office: "Downtown", active: true },
  { id: "u2", name: "Dr. Rosa Alvarez", username: "ralvarez", email: "r.alvarez@icardio.com", role: "Provider", office: "Eastside", active: true },
  { id: "u3", name: "Jordan Carter, NP", username: "jcarter", email: "j.carter@icardio.com", role: "Provider", office: "At Home", active: true },
  { id: "u4", name: "Amanda Ross", username: "aross", email: "a.ross@icardio.com", role: "Admin", office: "Downtown", active: true },
  { id: "u5", name: "Diego Morales", username: "dmorales", email: "d.morales@icardio.com", role: "MA", office: "Eastside", active: true },
  { id: "u6", name: "Chloe Simmons", username: "csimmons", email: "c.simmons@icardio.com", role: "Front Desk", office: "Downtown", active: false },
]

export const currentUser = staffUsers[0]

export const macros: Macro[] = [
  { shortcut: "//tol", expansion: "Patient tolerating medication well with no adverse effects reported." },
  { shortcut: "//titr", expansion: "Continue current titration schedule; recheck in 2 weeks." },
  { shortcut: "//diet", expansion: "Reviewed diet, hydration, and protein intake goals with patient." },
  { shortcut: "//b12", expansion: "Administered B12 1 mL IM, left deltoid. Tolerated well." },
  { shortcut: "//nv", expansion: "Patient reports mild nausea; advised smaller meals and hydration." },
]

// ---- derived queue helpers -------------------------------------------------

export interface QueueRow {
  visitId: string
  date: string
  patientId: string
  patientName: string
  dob: string
}

function dedupeByPatient(rows: Visit[]): QueueRow[] {
  const seen = new Set<string>()
  const out: QueueRow[] = []
  for (const v of rows) {
    if (seen.has(v.patientId)) continue
    const p = getPatient(v.patientId)
    if (!p) continue
    seen.add(v.patientId)
    out.push({ visitId: v.id, date: v.date, patientId: p.id, patientName: fullName(p), dob: p.dob })
    if (out.length === 6) break
  }
  return out
}

export function unsignedQueue(office: Office): QueueRow[] {
  return dedupeByPatient(
    visits.filter((v) => !v.signed && getPatient(v.patientId)?.office === office),
  )
}

export function signedQueue(office: Office): QueueRow[] {
  return dedupeByPatient(
    visits.filter((v) => v.signed && getPatient(v.patientId)?.office === office),
  )
}
