"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, UserPlus } from "lucide-react"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { OFFICES } from "@/lib/mock-data"

const STATES = ["CA", "AZ", "NV", "TX", "FL"]
const REFERRALS = ["Google", "Instagram", "Friend Referral", "Facebook", "Walk-in", "Yelp"]

function SelectField({
  label,
  options,
  placeholder,
}: {
  label: string
  options: string[]
  placeholder: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export default function NewPatientPage() {
  const [atHome, setAtHome] = React.useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        nativeButton={false}
        render={<Link href="/patients" />}
      >
        <ArrowLeft data-icon="inline-start" />
        Back to patients
      </Button>

      <PageHeader title="New Patient" description="Create a new patient record." />

      <Card>
        <CardHeader>
          <CardTitle>Patient intake</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="first">First name</FieldLabel>
                <Input id="first" placeholder="First name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="last">Last name</FieldLabel>
                <Input id="last" placeholder="Last name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
                <Input id="dob" type="date" />
              </Field>
              <SelectField label="Gender" options={["Female", "Male"]} placeholder="Select" />
              <Field>
                <FieldLabel htmlFor="height">Height</FieldLabel>
                <Input id="height" placeholder={`5' 6"`} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" placeholder="(951) 555-0000" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" placeholder="patient@email.com" />
              </Field>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="street">Street address</FieldLabel>
                <Input id="street" placeholder="123 Main St" />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input id="city" placeholder="City" />
              </Field>
              <SelectField label="State" options={STATES} placeholder="State" />
              <Field>
                <FieldLabel htmlFor="zip">ZIP</FieldLabel>
                <Input id="zip" placeholder="00000" />
              </Field>
              <SelectField label="Office" options={[...OFFICES]} placeholder="Select office" />
              <SelectField label="Language" options={["English", "Spanish"]} placeholder="Select" />
              <SelectField label="Referral source" options={REFERRALS} placeholder="Select" />
            </div>

            <Separator />

            <Field orientation="horizontal">
              <FieldLabel htmlFor="athome">At Home program</FieldLabel>
              <Switch id="athome" checked={atHome} onCheckedChange={setAtHome} />
            </Field>
            {atHome ? (
              <SelectField
                label="Program type"
                options={["At-Home GLP-1", "At-Home Lipoden", "At-Home Maintenance"]}
                placeholder="Select program"
              />
            ) : null}

            <Field>
              <FieldLabel htmlFor="history">Meds &amp; history</FieldLabel>
              <Textarea
                id="history"
                rows={4}
                placeholder="Current medications, allergies, and relevant history…"
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button>
            <UserPlus data-icon="inline-start" />
            Create Patient
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
