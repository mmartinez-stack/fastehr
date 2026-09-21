-- ADR 37: a durable PHI audit trail, replacing the stdout-only sink.


-- CreateEnum
CREATE TYPE "audit_transport" AS ENUM ('trpc', 'rest', 'cli');

-- CreateEnum
CREATE TYPE "audit_actor_kind" AS ENUM ('staff', 'integration', 'anonymous');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('allowed', 'denied', 'error');

-- CreateTable
CREATE TABLE "phi_audit_events" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transport" "audit_transport" NOT NULL,
    "actorKind" "audit_actor_kind" NOT NULL,
    "actorId" TEXT,
    "apiKeyId" TEXT,
    "verificationId" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT,
    "routeTemplate" TEXT,
    "outcome" "audit_outcome" NOT NULL,
    "code" TEXT,
    "httpStatus" INTEGER,
    "patientId" TEXT,
    "resourceKind" TEXT,
    "resourceId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "phi_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phi_audit_events_occurredAt_idx" ON "phi_audit_events"("occurredAt");

-- CreateIndex
CREATE INDEX "phi_audit_events_actorId_occurredAt_idx" ON "phi_audit_events"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "phi_audit_events_patientId_occurredAt_idx" ON "phi_audit_events"("patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "phi_audit_events_outcome_occurredAt_idx" ON "phi_audit_events"("outcome", "occurredAt");


-- ADR 37: the trail is append-only. The application exposes no update or
-- delete, and the database refuses them too, so a compromised or careless
-- session cannot rewrite what it reached. Reads are unaffected.
CREATE OR REPLACE FUNCTION phi_audit_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'phi_audit_events is append-only (ADR 37): % refused', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER phi_audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON "phi_audit_events"
  FOR EACH ROW EXECUTE FUNCTION phi_audit_events_immutable();

CREATE TRIGGER phi_audit_events_no_truncate
  BEFORE TRUNCATE ON "phi_audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION phi_audit_events_immutable();
