import type { StaffRole } from "@fastehr/contracts"

/**
 * Display names for the real role vocabulary (`StaffRole` in contracts).
 * One map, shared by every surface that shows a role — the Users screen, the
 * header's "Viewing as" switcher, and any copy that names the current view —
 * so a label change happens once.
 */
export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  provider: "Provider",
  frontdesk: "Front Desk",
}
