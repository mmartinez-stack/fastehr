import type {
  IntakeContactTime,
  PatientCondition,
  PatientGender,
  PatientLanguage,
} from "@fastehr/contracts"

import type { FormCopy } from "@/lib/form-errors"

/**
 * Every word the person reads on the intake page, in both languages the
 * clinic serves. The form starts in the language the front desk chose for
 * the text message and the person can switch; the consent they sign is
 * recorded in the language it was shown in.
 *
 * Patient-facing copy is plainer than the staff form's: no clinical
 * shorthand, second person, one idea per label. The vocabulary values
 * themselves (office names, referral sources) are the clinic's and are
 * shown as they are.
 */

export interface IntakeCopy {
  page: {
    opening: string
    invalidTitle: string
    invalidDescription: string
    welcome: (firstName: string) => string
    intro: string
    requiredHint: string
    doneTitle: (firstName: string) => string
    doneDescription: string
    send: string
    sending: string
    notSentTitle: string
    notSent: string
    fixFields: string
    fallbackField: string
  }
  sections: {
    about: string
    reach: string
    address: string
    visit: string
    health: string
    consent: string
  }
  labels: {
    firstName: string
    lastName: string
    dateOfBirth: string
    dateOfBirthHint: string
    gender: string
    phone: string
    phoneHint: string
    followUp: string
    contactTime: string
    email: string
    street: string
    city: string
    state: string
    zip: string
    office: string
    officeHint: string
    referralSource: string
    heightFeet: string
    heightInches: string
    heightHint: string
    conditionsIntro: string
    onset: string
    details: string
    otherConditions: string
    otherConditionsHint: string
    medicationsIntro: string
    medication: string
    dose: string
    frequency: string
    addMedication: string
    removeMedication: string
    pcpName: string
    pcpPhone: string
    consentIntro: string
    consentAcknowledge: string
    signature: string
    signatureHint: (fullName: string) => string
    signedOn: string
  }
  options: {
    gender: Record<PatientGender, string>
    contactTime: Record<IntakeContactTime, string>
    yes: string
    no: string
    select: string
  }
  conditions: Record<PatientCondition, string>
  errors: FormCopy
}

export const INTAKE_COPY: Readonly<Record<PatientLanguage, IntakeCopy>> = {
  english: {
    page: {
      opening: "Opening your form…",
      invalidTitle: "This link is no longer valid",
      invalidDescription:
        "It may have expired or already been used. Please ask the clinic to send you a new one.",
      welcome: (firstName) => (firstName === "" ? "Welcome" : `Welcome, ${firstName}`),
      intro:
        "Please answer each section below, then sign and send. It takes about five minutes.",
      requiredHint: "Fields marked with * are required.",
      doneTitle: (firstName) => (firstName === "" ? "Thank you" : `Thank you, ${firstName}`),
      doneDescription:
        "Your information has been sent to the clinic. The front desk will review it before your visit. You can close this page.",
      send: "Send to the clinic",
      sending: "Sending…",
      notSentTitle: "Your form was not sent",
      notSent: "Check your connection and try again.",
      fixFields: "Please check the highlighted fields.",
      fallbackField: "Please check this answer.",
    },
    sections: {
      about: "About you",
      reach: "How to reach you",
      address: "Your address",
      visit: "Your visit",
      health: "Your health",
      consent: "Consent for treatment",
    },
    labels: {
      firstName: "First name",
      lastName: "Last name",
      dateOfBirth: "Date of birth",
      dateOfBirthHint: "Month, day, year. For example 03/21/1985.",
      gender: "Gender",
      phone: "Mobile phone",
      phoneHint: "Ten digits, any format.",
      followUp: "It is OK for the clinic to call, text, or email me about my care",
      contactTime: "Best time to reach you",
      email: "Email",
      street: "Street address",
      city: "City",
      state: "State",
      zip: "Zip code",
      office: "Office you will visit",
      officeHint: "Your form goes to this office.",
      referralSource: "How did you hear about us?",
      heightFeet: "Height (feet)",
      heightInches: "Height (inches)",
      heightHint: "0 to 11.",
      conditionsIntro: "Do you have, or have you had, any of the following?",
      onset: "Since when?",
      details: "Tell us about it",
      otherConditions: "Any other medical conditions?",
      otherConditionsHint: "Anything not on the list above.",
      medicationsIntro: "List the medications you take now, one per line.",
      medication: "Medication",
      dose: "Dose",
      frequency: "How often",
      addMedication: "Add a medication",
      removeMedication: "Remove medication",
      pcpName: "Your primary care doctor",
      pcpPhone: "Doctor's phone",
      consentIntro: "Please read the consent below, then confirm and sign with your name.",
      consentAcknowledge: "I have read and agree to the consent above",
      signature: "Signature",
      signatureHint: (fullName) => `Type your full name as entered above: ${fullName}`,
      signedOn: "Date",
    },
    options: {
      gender: { male: "Male", female: "Female" },
      contactTime: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" },
      yes: "Yes",
      no: "No",
      select: "Select…",
    },
    conditions: {
      hypertension: "High blood pressure",
      heart_disease: "Heart disease",
      stroke: "Stroke",
      high_cholesterol: "High cholesterol",
      diabetes: "Diabetes",
      thyroid: "Thyroid condition",
      kidney_disease: "Kidney disease",
      liver_disease: "Liver disease",
      sleep_apnea: "Sleep apnea",
      asthma: "Asthma",
      seizures: "Seizures",
      glaucoma: "Glaucoma",
      depression_or_anxiety: "Depression or anxiety",
      pregnancy_or_breastfeeding: "Pregnant or breastfeeding",
    },
    errors: {
      firstName: { too_small: "Enter your first name.", too_big: "First name can be at most 50 characters." },
      lastName: { too_small: "Enter your last name.", too_big: "Last name can be at most 100 characters." },
      gender: { invalid_value: "Select your gender." },
      dateOfBirth: {
        invalid_format: "Enter your date of birth as month/day/year, like 03/21/1985.",
        custom: "Date of birth must be a past date.",
      },
      office: { invalid_value: "Select the office you will visit.", invalid_type: "Select the office you will visit." },
      email: { invalid_format: "Enter a valid email address, like name@example.com." },
      addressStreet: { too_small: "Enter your street address.", too_big: "Street can be at most 200 characters." },
      addressCity: { too_small: "Enter your city.", too_big: "City can be at most 100 characters." },
      addressState: { invalid_format: "Select your state." },
      addressZip: { invalid_format: "Enter a zip code of three to eight digits." },
      phone: { invalid_format: "Enter a phone number with ten digits." },
      preferredContactTime: { invalid_value: "Choose the best time to reach you." },
      referralSource: { invalid_value: "Select an option from the list." },
      heightFeet: { invalid_format: "Select the feet." },
      heightInchesPart: { invalid_format: "Enter inches from 0 to 11." },
      "medications.name": { too_small: "Enter the medication name.", too_big: "Name can be at most 100 characters." },
      "medications.dose": { too_big: "Dose can be at most 50 characters." },
      "medications.frequency": { too_big: "Keep this under 50 characters." },
      medications: { too_big: "The list is limited to 50 medications." },
      "conditions.onset": { too_big: "Keep this under 100 characters." },
      "conditions.details": { custom: "Tell us a little about this condition.", too_big: "Keep this under 500 characters." },
      historyOther: { too_big: "Keep this under 10,000 characters." },
      pcpName: { too_big: "Name can be at most 100 characters." },
      pcpPhone: { invalid_format: "Enter a phone number with ten digits." },
      consentAcknowledged: { invalid_value: "Please confirm that you have read the consent." },
      consentVersion: { invalid_value: "The consent text has changed. Reload the page and sign again." },
      consentSignature: {
        too_small: "Type your full name to sign.",
        too_big: "Keep the signature under 150 characters.",
        custom: "Type your name exactly as you entered it above.",
      },
    },
  },

  spanish: {
    page: {
      opening: "Abriendo su formulario…",
      invalidTitle: "Este enlace ya no es válido",
      invalidDescription:
        "Puede haber expirado o ya fue usado. Por favor pida a la clínica que le envíe uno nuevo.",
      welcome: (firstName) => (firstName === "" ? "Bienvenido" : `Bienvenido, ${firstName}`),
      intro:
        "Por favor responda cada sección, luego firme y envíe. Toma unos cinco minutos.",
      requiredHint: "Los campos marcados con * son obligatorios.",
      doneTitle: (firstName) => (firstName === "" ? "Gracias" : `Gracias, ${firstName}`),
      doneDescription:
        "Su información fue enviada a la clínica. La recepción la revisará antes de su visita. Puede cerrar esta página.",
      send: "Enviar a la clínica",
      sending: "Enviando…",
      notSentTitle: "Su formulario no se envió",
      notSent: "Revise su conexión e intente de nuevo.",
      fixFields: "Por favor revise los campos marcados.",
      fallbackField: "Por favor revise esta respuesta.",
    },
    sections: {
      about: "Sobre usted",
      reach: "Cómo contactarle",
      address: "Su dirección",
      visit: "Su visita",
      health: "Su salud",
      consent: "Consentimiento para tratamiento",
    },
    labels: {
      firstName: "Nombre",
      lastName: "Apellido",
      dateOfBirth: "Fecha de nacimiento",
      dateOfBirthHint: "Mes, día y año. Por ejemplo 03/21/1985.",
      gender: "Género",
      phone: "Teléfono celular",
      phoneHint: "Diez dígitos, en cualquier formato.",
      followUp: "Acepto que la clínica me llame, me envíe mensajes de texto o correos electrónicos sobre mi atención",
      contactTime: "Mejor horario para contactarle",
      email: "Correo electrónico",
      street: "Calle y número",
      city: "Ciudad",
      state: "Estado",
      zip: "Código postal",
      office: "Oficina que visitará",
      officeHint: "Su formulario se envía a esta oficina.",
      referralSource: "¿Cómo se enteró de nosotros?",
      heightFeet: "Estatura (pies)",
      heightInches: "Estatura (pulgadas)",
      heightHint: "De 0 a 11.",
      conditionsIntro: "¿Tiene o ha tenido alguna de las siguientes condiciones?",
      onset: "¿Desde cuándo?",
      details: "Cuéntenos al respecto",
      otherConditions: "¿Alguna otra condición médica?",
      otherConditionsHint: "Cualquier condición que no esté en la lista anterior.",
      medicationsIntro: "Anote los medicamentos que toma actualmente, uno por línea.",
      medication: "Medicamento",
      dose: "Dosis",
      frequency: "Con qué frecuencia",
      addMedication: "Agregar un medicamento",
      removeMedication: "Quitar medicamento",
      pcpName: "Su médico de cabecera",
      pcpPhone: "Teléfono del médico",
      consentIntro: "Por favor lea el consentimiento, luego confirme y firme con su nombre.",
      consentAcknowledge: "He leído y acepto el consentimiento anterior",
      signature: "Firma",
      signatureHint: (fullName) => `Escriba su nombre completo tal como lo ingresó arriba: ${fullName}`,
      signedOn: "Fecha",
    },
    options: {
      gender: { male: "Masculino", female: "Femenino" },
      contactTime: { morning: "Mañana", afternoon: "Tarde", evening: "Noche" },
      yes: "Sí",
      no: "No",
      select: "Seleccione…",
    },
    conditions: {
      hypertension: "Presión arterial alta",
      heart_disease: "Enfermedad del corazón",
      stroke: "Derrame cerebral",
      high_cholesterol: "Colesterol alto",
      diabetes: "Diabetes",
      thyroid: "Problemas de tiroides",
      kidney_disease: "Enfermedad de los riñones",
      liver_disease: "Enfermedad del hígado",
      sleep_apnea: "Apnea del sueño",
      asthma: "Asma",
      seizures: "Convulsiones",
      glaucoma: "Glaucoma",
      depression_or_anxiety: "Depresión o ansiedad",
      pregnancy_or_breastfeeding: "Embarazo o lactancia",
    },
    errors: {
      firstName: { too_small: "Escriba su nombre.", too_big: "El nombre puede tener hasta 50 caracteres." },
      lastName: { too_small: "Escriba su apellido.", too_big: "El apellido puede tener hasta 100 caracteres." },
      gender: { invalid_value: "Seleccione su género." },
      dateOfBirth: {
        invalid_format: "Escriba su fecha de nacimiento como mes/día/año, por ejemplo 03/21/1985.",
        custom: "La fecha de nacimiento debe ser una fecha pasada.",
      },
      office: { invalid_value: "Seleccione la oficina que visitará.", invalid_type: "Seleccione la oficina que visitará." },
      email: { invalid_format: "Escriba un correo válido, como nombre@ejemplo.com." },
      addressStreet: { too_small: "Escriba su dirección.", too_big: "La dirección puede tener hasta 200 caracteres." },
      addressCity: { too_small: "Escriba su ciudad.", too_big: "La ciudad puede tener hasta 100 caracteres." },
      addressState: { invalid_format: "Seleccione su estado." },
      addressZip: { invalid_format: "Escriba un código postal de tres a ocho dígitos." },
      phone: { invalid_format: "Escriba un número de teléfono de diez dígitos." },
      preferredContactTime: { invalid_value: "Elija el mejor horario para contactarle." },
      referralSource: { invalid_value: "Seleccione una opción de la lista." },
      heightFeet: { invalid_format: "Seleccione los pies." },
      heightInchesPart: { invalid_format: "Escriba pulgadas de 0 a 11." },
      "medications.name": { too_small: "Escriba el nombre del medicamento.", too_big: "El nombre puede tener hasta 100 caracteres." },
      "medications.dose": { too_big: "La dosis puede tener hasta 50 caracteres." },
      "medications.frequency": { too_big: "Use menos de 50 caracteres." },
      medications: { too_big: "La lista permite hasta 50 medicamentos." },
      "conditions.onset": { too_big: "Use menos de 100 caracteres." },
      "conditions.details": { custom: "Cuéntenos un poco sobre esta condición.", too_big: "Use menos de 500 caracteres." },
      historyOther: { too_big: "Use menos de 10,000 caracteres." },
      pcpName: { too_big: "El nombre puede tener hasta 100 caracteres." },
      pcpPhone: { invalid_format: "Escriba un número de teléfono de diez dígitos." },
      consentAcknowledged: { invalid_value: "Por favor confirme que leyó el consentimiento." },
      consentVersion: { invalid_value: "El texto del consentimiento cambió. Recargue la página y firme de nuevo." },
      consentSignature: {
        too_small: "Escriba su nombre completo para firmar.",
        too_big: "La firma debe tener menos de 150 caracteres.",
        custom: "Escriba su nombre exactamente como lo ingresó arriba.",
      },
    },
  },
}
