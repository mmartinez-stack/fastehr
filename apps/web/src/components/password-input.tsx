"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

/**
 * A password field with a reveal toggle. Shared by /login and
 * /change-password (ADR 20: several routes, no one domain).
 *
 * Visibility is per-field and never outlives the component — a field that
 * unmounts revealed comes back masked. The toggle is a plain button, not part
 * of the value: `type` is the only input prop this owns, everything else
 * (name, autocomplete, minLength) passes through.
 */
export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <InputGroup>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
