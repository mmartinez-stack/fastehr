"use client"

import { useState } from "react"
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { staffUsers as seedUsers, OFFICES, type StaffUser } from "@/lib/mock-data"
import { toast } from "sonner"
import {
  UserPlusIcon,
  MoreHorizontal,
  CircleCheck,
  CircleSlash,
  Trash2,
} from "lucide-react"

const ROLES = ["Provider", "Admin", "MA", "Front Desk"]

function initials(name: string) {
  return name
    .replace(/(Dr\.|,.*$)/g, "")
    .trim()
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
}

const roleVariant: Record<string, "default" | "secondary" | "outline"> = {
  Provider: "default",
  Admin: "secondary",
  MA: "outline",
  "Front Desk": "outline",
}

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>(seedUsers)

  function setActive(id: string, active: boolean) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)))
    const u = users.find((x) => x.id === id)
    toast.success(`${u?.name ?? "User"} ${active ? "enabled" : "disabled"}`)
  }

  function deleteUser(id: string) {
    const u = users.find((x) => x.id === id)
    setUsers((prev) => prev.filter((x) => x.id !== id))
    toast.success(`${u?.name ?? "User"} deleted`)
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage staff accounts, roles, and office access."
        actions={
          <Dialog>
            <DialogTrigger
              render={
                <Button size="sm">
                  <UserPlusIcon data-icon="inline-start" />
                  Add User
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add staff member</DialogTitle>
                <DialogDescription>Invite a new user to the clinic workspace.</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="u-name">Full name</FieldLabel>
                  <Input id="u-name" placeholder="Jane Doe" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="u-username">Username</FieldLabel>
                  <Input id="u-username" placeholder="jdoe" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="u-email">Email</FieldLabel>
                  <Input id="u-email" type="email" placeholder="jane@fastehr.com" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <Select defaultValue="Provider" items={ROLES.map((r) => ({ label: r, value: r }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Office</FieldLabel>
                    <Select defaultValue="Downtown" items={OFFICES.map((o) => ({ label: o, value: o }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFICES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                <DialogClose
                  render={
                    <Button onClick={() => toast.success("Invitation sent")}>Send Invite</Button>
                  }
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
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
                        <span className="text-xs text-muted-foreground">
                          {u.email} · {u.office}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-muted-foreground">{u.username}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleVariant[u.role] ?? "outline"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="ghost" className="bg-success/15 text-success">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="ghost" className="bg-muted text-muted-foreground">
                        Disabled
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
                        {u.active ? (
                          <DropdownMenuItem onClick={() => setActive(u.id, false)}>
                            <CircleSlash />
                            Disable
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setActive(u.id, true)}>
                            <CircleCheck />
                            Enable
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => deleteUser(u.id)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
