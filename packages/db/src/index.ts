/**
 * Persistence layer.
 *
 * No ORM is selected yet — that is a later ticket, and it will add the schema,
 * migrations, and generated client under this package. What is fixed now is the
 * direction of the dependency: `db` implements the ports that `@fastehr/core`
 * declares, and `core` never imports `db`.
 *
 * `createInMemoryPatientRepository` is the placeholder implementation that keeps
 * the wiring honest until the real client lands.
 */
export { createInMemoryPatientRepository } from './repositories/in-memory-patient-repository.js'
