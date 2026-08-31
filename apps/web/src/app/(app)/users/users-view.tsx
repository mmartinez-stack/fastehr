"use client"

import * as React from "react"
import { useForm } from "@tanstack/react-form"
import {
  createStaffUserInput,
  describeValidationFailure,
  STAFF_ROLES,
  updateStaffUserInput,
  type StaffRole,
  type StaffUser,
} from "@fastehr/contracts"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/required-mark"
import { toFormErrors, validationFrom, type FormCopy, type FormErrors } from "@/lib/form-errors"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { CircleCheck, CircleSlash, PencilIcon, Search, UserPlusIcon } from "lucide-react"

/**
 * Staff administration on the reference form pattern (docs/forms.md, ADR 25):
 * the same contract inputs validate in the dialog and in the admin-gated
 * mutation, and every message a user reads lives in the copy table here.
 *
 * The list carries the single-input search (ADR 27's pattern): an `@` in the
 * query means email, anything else is a name, both matched by substring. Row
 * actions are inline buttons on the row — never folded into an overflow menu.
 */

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  provider: "Provider",
  frontdesk: "Front Desk",
}

const ROLE_OPTIONS = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABEL[value] }))

const roleVariant: Record<StaffRole, "default" | "secondary" | "outline"> = {
  provider: "default",
  admin: "secondary",
  frontdesk: "outline",
}

/** Every message a user reads, keyed by field and issue code (ADR 12). */
const COPY: FormCopy = {
  name: { too_small: "Enter the staff member's full name." },
  email: { invalid_format: "Enter a valid email address, like name@example.com." },
  role: { invalid_value: "Select a role." },
}

const EMAIL_TAKEN: FormErrors = { fields: { email: { message: "That email is already in use." } } }
const SAVE_FAILED = "The changes could not be saved. Check your connection and try again."

function initials(name: string) {
  return name
    .replace(/(Dr\.|,.*$)/g, "")
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
}

function roleSelect(field: {
  name: string
  state: { value: string; meta: { isValid: boolean; errors: Array<{ message?: string } | undefined> } }
  handleChange: (value: string) => void
}) {
  return (
    <Field data-invalid={!field.state.meta.isValid}>
      <FieldLabel htmlFor={field.name}>
        Role
        <RequiredMark />
      </FieldLabel>
      <Select
        value={field.state.value}
        onValueChange={(value) => field.handleChange(typeof value === "string" ? value : "")}
      >
        <SelectTrigger id={field.name} className="w-full" aria-invalid={!field.state.meta.isValid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={field.state.meta.errors} />
    </Field>
  )
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils()
  const create = trpc.staffUsers.create.useMutation()

  const form = useForm({
    defaultValues: { name: "", email: "", role: "frontdesk" },
    validators: {
      onSubmit: ({ value }) => {
        const result = createStaffUserInput.safeParse(value)
        if (result.success) return undefined
        const failure = describeValidationFailure(result.error)
        return failure === null ? undefined : toFormErrors(failure, COPY)
      },
      onSubmitAsync: async ({ value }) => {
        try {
          const created = await create.mutateAsync({
            ...value,
            role: value.role as StaffRole,
          })
          toast.success(`${created.name} added. Issue a temporary password to enable sign-in`)
          void utils.staffUsers.invalidate()
          onDone()
          return undefined
        } catch (error) {
          if ((error as { data?: { code?: string } }).data?.code === "CONFLICT") return EMAIL_TAKEN
          const failure = validationFrom(error)
          if (failure !== null) return toFormErrors(failure, COPY)
          return { form: SAVE_FAILED, fields: {} }
        }
      },
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      noValidate
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor="u-name">
                Full name
                <RequiredMark />
              </FieldLabel>
              <Input
                id="u-name"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                placeholder="Jane Doe"
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor="u-email">
                Email
                <RequiredMark />
              </FieldLabel>
              <Input
                id="u-email"
                type="email"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
                placeholder="jane@example.com"
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="role">{roleSelect}</form.Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add user"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

function EditUserForm({ user, onDone }: { user: StaffUser; onDone: () => void }) {
  const utils = trpc.useUtils()
  const update = trpc.staffUsers.update.useMutation()

  const form = useForm({
    defaultValues: { name: user.name, role: user.role as string },
    validators: {
      onSubmit: ({ value }) => {
        const result = updateStaffUserInput.safeParse({ id: user.id, ...value })
        if (result.success) return undefined
        const failure = describeValidationFailure(result.error)
        return failure === null ? undefined : toFormErrors(failure, COPY)
      },
      onSubmitAsync: async ({ value }) => {
        try {
          const updated = await update.mutateAsync({
            id: user.id,
            name: value.name,
            role: value.role as StaffRole,
          })
          toast.success(`${updated.name} saved`)
          void utils.staffUsers.invalidate()
          onDone()
          return undefined
        } catch (error) {
          const failure = validationFrom(error)
          if (failure !== null) return toFormErrors(failure, COPY)
          return { form: SAVE_FAILED, fields: {} }
        }
      },
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      noValidate
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => (
            <Field data-invalid={!field.state.meta.isValid}>
              <FieldLabel htmlFor="e-name">
                Full name
                <RequiredMark />
              </FieldLabel>
              <Input
                id="e-name"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={!field.state.meta.isValid}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="role">{roleSelect}</form.Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const utils = trpc.useUtils()

  const [query, setQuery] = React.useState("")
  // What the Search button last submitted — same explicit-search behavior as
  // the patient roster; typing alone never queries.
  const [submitted, setSubmitted] = React.useState<string | null>(null)

  const list = trpc.staffUsers.list.useQuery(undefined, { enabled: submitted === null })
  const search = trpc.staffUsers.search.useQuery(
    { query: submitted ?? "" },
    { enabled: submitted !== null },
  )
  const active = submitted === null ? list : search
  const users = active.data ?? []

  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<StaffUser | null>(null)

  const setActive = trpc.staffUsers.setActive.useMutation({
    onSuccess: (updated) => {
      toast.success(`${updated.name} ${updated.isActive ? "enabled" : "disabled"}`)
      void utils.staffUsers.invalidate()
    },
    onError: (error) =>
      toast.error(
        error.message === "cannot deactivate your own account"
          ? "You cannot disable your own account."
          : "Could not change status.",
      ),
  })

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage staff accounts and roles."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlusIcon data-icon="inline-start" />
            Add User
          </Button>
        }
      />

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex items-start gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = query.trim()
              setSubmitted(trimmed.length >= 2 ? trimmed : null)
            }}
          >
            <Field className="flex-1">
              <FieldLabel htmlFor="user-search">Search</FieldLabel>
              <Input
                id="user-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
              />
              <FieldDescription>
                One box for both. An @ means email, anything else is a name.
              </FieldDescription>
            </Field>
            {/* Mirrors a Field's label-then-control rhythm (gap-2, leading-snug
                label) so the h-8 buttons sit exactly on the inputs' row. */}
            <div className="flex shrink-0 flex-col gap-2">
              <span aria-hidden="true" className="invisible text-sm leading-snug font-medium">
                Search
              </span>
              <div className="flex gap-2">
                <Button type="submit">
                  <Search data-icon="inline-start" />
                  Search
                </Button>
                {submitted !== null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setQuery("")
                      setSubmitted(null)
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credential</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleVariant[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge variant="ghost" className="bg-success/15 text-success">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="ghost" className="bg-muted text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.hasCredential ? (
                      <span className="text-xs text-muted-foreground">Issued</span>
                    ) : (
                      <Badge variant="ghost" className="bg-warning/15 text-warning">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Actions live on the row itself — no overflow menu. */}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(u)}>
                        <PencilIcon data-icon="inline-start" />
                        Edit
                      </Button>
                      {u.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={u.id === currentUserId || setActive.isPending}
                          onClick={() => setActive.mutate({ id: u.id, isActive: false })}
                        >
                          <CircleSlash data-icon="inline-start" />
                          Disable
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={setActive.isPending}
                          onClick={() => setActive.mutate({ id: u.id, isActive: true })}
                        >
                          <CircleCheck data-icon="inline-start" />
                          Enable
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {active.isPending ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading users…
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {submitted === null ? "No staff accounts yet." : "No users match your search."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff member</DialogTitle>
            <DialogDescription>
              Creates the account only. Sign-in requires a temporary password issued by an
              administrator afterwards.
            </DialogDescription>
          </DialogHeader>
          {addOpen ? <CreateUserForm onDone={() => setAddOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit staff member</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          {editing === null ? null : (
            <EditUserForm key={editing.id} user={editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
