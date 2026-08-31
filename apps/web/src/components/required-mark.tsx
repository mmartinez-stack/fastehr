/**
 * The asterisk after a required field's label. The convention is
 * marker-on-required (CLAUDE.md, UI defaults): optional fields carry no
 * "Optional" text. Hidden from screen readers, which learn requiredness from
 * validation, not typography.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      {" *"}
    </span>
  )
}
