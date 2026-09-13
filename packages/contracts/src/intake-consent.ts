import type { PatientLanguage } from './patient.ts'

/**
 * The treatment consent the self-service intake asks the person to sign
 * (DIA-72, ADR 29 as amended). The wording is the clinic's own, carried over
 * from the previous intake form verbatim in both languages, because it is
 * what patients have been signing; changing a word is the clinic's call, and
 * when it happens the version below changes with it so a stored signature
 * always names the text it was given for.
 *
 * Lives in contracts because both sides need it: the page renders it, and
 * the submit input refuses a signature against any version but the current
 * one. Consent tracking as a module of its own (DIA-56) will take these
 * over; until then the signed version, language, name, and time are recorded
 * on the intake request.
 */

export const INTAKE_CONSENT_VERSION = 'telehealth-treatment-consent/1' as const

export const INTAKE_CONSENT_TEXT: Readonly<Record<PatientLanguage, string>> = {
  english: `I consent to receive evaluation, treatment, and care via telehealth by HEALTHYSTEPS and by their employed, contracted, and affiliated healthcare providers. I authorize HEALTHYSTEPS to work with my other healthcare providers on my behalf.

I agree to consult with a medical provider at HealthySteps. I agree that if medication is prescribed, I will take the medication only as prescribed. If I experience any side effects, I will inform HEALTHYSTEPS immediately.

I will inform HEALTHY STEPS about any new medical condition and/or new medication and side effects or issues with the medications.

I do not have a history of cardiovascular disease, pulmonary hypertension, severe or uncontrolled high blood pressure, overactive thyroid, glaucoma, pregnant, or breastfeeding.

I do not have a history of drug abuse.

HEALTHYSTEPS is not liable for any damaged or lost medications.

I am hereby initiating and agreeing to receive telehealth services including, without limitation, telehealth visits, e-visits, and virtual check-ins from HEALTHY STEPS at the cell phone number and email address that I have provided in my patient registration information. These visits may include texting, email, telephone, videoconference, or other technologies as available.

I understand and acknowledge that the telehealth technology used may potentially introduce privacy and other risks including interruptions, unauthorized access, and technical difficulties.

I understand that my healthcare provider or I can discontinue the telehealth consult/visit if it is felt that the technological connections are not adequate for the situation.

HEALTHYSTEPS is not liable for any damaged or lost medications.

For health and program tips, I consent to the use of my email address for marketing that could include Facebook, Instagram, email, and/or text.

My signature below evidences my agreement to all of the terms set forth in this consent. I understand that this consent is effective on the date signed below and that I may revoke this consent in writing. My revocation will not be effective for actions already taken by HEALTHYSTEPS or that are in progress and will only be prospectively effective.

I have read and understood this form and I am the patient to sign this consent.

By typing my name and date below, I hereby acknowledge that I understand and consent to the above terms:`,

  spanish: `Yo doy mi consentimiento para recibir evaluación, tratamiento y atención a través de telesalud por HEALTHYSTEPS y sus empleados, contratados y afiliados proveedores de atención médica. Autorizo a HEALTHYSTEPS para trabajar con mis otros proveedores de atención médica en mi nombre.

Yo acepto consultar con un proveedor médico en HEALTHYSTEPS. Yo estoy de acuerdo en que si me recetan medicamentos, los tomare solo como me los recetaron. Si tengo algun efecto secundario, yo informare a HEALTHYSTEPS inmediatamente.

Yo informaré a HEALTHYSTEPS sobre cualquier condición médica nueva y / o medicamento nuevo y los efectos secundarios o problemas con los medicamentos.

Yo no tengo antecedentes de enfermedad cardiovascular, hipertensión pulmonar, presión arterial alta severa o no controlada, tiroides hiperactiva, glaucoma, embarazada o amamantamiento.

Yo no tengo antecedentes de abuso de drogas.

Por la presente, inicio y acepto recibir servicios de telesalud que incluyen, entre otros, visitas de telesalud, visitas electrónicas y registros virtuales de HEALTHYSTEPS en el número de teléfono celular y la dirección de correo electrónico que he proporcionado en la información de mi registro de paciente. Estas visitas pueden incluir mensajes de texto, correo electrónico, teléfono, videoconferencia o otras tecnologías disponibles.

Yo entiendo y reconozco que la tecnología de telesalud utilizada puede introducir riesgos de privacidad y otros riesgos, incluyendo interrupciones, acceso no autorizado y dificultades técnicas.

Yo entiendo que mi proveedor de atención médica o yo podemos suspender la consulta / visita de telesalud si consideramos que las conexiones tecnológicas no son adecuadas para la situación.

HEALTHYSTEPS no es responsable de ningún medicamento dañado o perdido.

Acepto el uso de mi direccion de correo electronico para el envio de recomendaciones de salud y del programa, asi como publicidad que puede incluir Facebook, Instagram, EMail y/o mensajes de texto.

Mi firma debajo evidencia mi aceptación de todos los términos establecidos en este consentimento. Yo entiendo que este consentimiento es efectivo en la fecha firmada debajo y que puedo revocarlo por escrito. Mi revocación no será efectiva para acciones ya tomadas por HEALTHYSTEPS o que estén en progreso y solo serán prospectivamente efectivas.

Yo he leído y comprendido este formulario y soy el paciente que firma este consentimiento.

Al escribir mi nombre y fecha debajo, yo reconozco que entiendo y acepto los términos anteriores:`,
}

/**
 * Whether a typed signature is the person's name: case, accents, and
 * spacing are not part of a name, so "jose lopez" signs for "José López".
 * Exported so the page can say "must match your name" as the person types
 * with the same rule the server refuses by.
 */
export function signatureMatchesName(signature: string, firstName: string, lastName: string): boolean {
  return fold(signature) === fold(`${firstName} ${lastName}`)
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
