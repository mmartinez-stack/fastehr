"use client"

import { useState } from "react"
import type { StaffRole, StaffUser } from "@fastehr/contracts"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import {
  UserPlusIcon,
  MoreHorizontal,
  CircleCheck,
  CircleSlash,
  PencilIcon,
} from "lucide-react"

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  provider: "Provider",
  frontdesk: "Front Desk",
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as StaffRole[]).map((value) => ({
  value,
  label: ROLE_LABEL[value],
}))

const roleVariant: Record<StaffRole, "default" | "secondary" | "outline"> = {
  provider: "default",
  admin: "secondary",
  frontdesk: "outline",
}

function initials(name: string) {
  return name
    .replace(/(Dr\.|,.*$)/g, "")
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
}

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const utils = trpc.useUtils()
  const { data: users } = trpc.staffUsers.list.useQuery()

  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<StaffUser | null>(null)

  const create = trpc.staffUsers.create.useMutation({
    onSuccess: (created) => {
      toast.success(`${created.name} added — issue a temporary password to enable sign-in`)
      setAddOpen(false)
      void utils.staffUsers.list.invalidate()
    },
    onError: (error) =>
      toast.error(error.data?.code === "CONFLICT" ? "That email is already in use." : "Could not add user."),
  })

  const update = trpc.staffUsers.update.useMutation({
    onSuccess: (updated) => {
      toast.success(`${updated.name} saved`)
      setEditing(null)
      void utils.staffUsers.list.invalidate()
    },
    onError: () => toast.error("Could not save changes."),
  })

  const setActive = trpc.staffUsers.setActive.useMutation({
    onSuccess: (updated) => {
      toast.success(`${updated.name} ${updated.isActive ? "enabled" : "disabled"}`)
      void utils.staffUsers.list.invalidate()
    },
    onError: (error) =>
      toast.error(
        error.message === "cannot deactivate your own account"
          ? "You cannot disable your own account."
          : "Could not change status.",
      ),
  })

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    create.mutate({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: (form.get("role") as StaffRole) ?? "frontdesk",
    })
  }

  function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (editing === null) return
    const form = new FormData(e.currentTarget)
    update.mutate({
      id: editing.id,
      name: String(form.get("name") ?? ""),
      role: (form.get("role") as StaffRole) ?? editing.role,
    })
  }

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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credential</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
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
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(u)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        {u.isActive ? (
                          <DropdownMenuItem
                            disabled={u.id === currentUserId}
                            onClick={() => setActive.mutate({ id: u.id, isActive: false })}
                          >
                            <CircleSlash />
                            Disable
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setActive.mutate({ id: u.id, isActive: true })}>
                            <CircleCheck />
                            Enable
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff member</DialogTitle>
            <DialogDescription>
              Creates the account only — sign-in requires a temporary password issued by an
              administrator afterwards.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="u-name">Full name</FieldLabel>
                <Input id="u-name" name="name" placeholder="Jane Doe" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="u-email">Email</FieldLabel>
                <Input id="u-email" name="email" type="email" placeholder="jane@example.com" required />
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select name="role" defaultValue="frontdesk" items={ROLE_OPTIONS}>
                  <SelectTrigger>
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
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding..." : "Add user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit staff member</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          {editing === null ? null : (
            <form onSubmit={submitEdit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="e-name">Full name</FieldLabel>
                  <Input id="e-name" name="name" defaultValue={editing.name} required />
                </Field>
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select name="role" defaultValue={editing.role} items={ROLE_OPTIONS}>
                    <SelectTrigger>
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
                </Field>
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
