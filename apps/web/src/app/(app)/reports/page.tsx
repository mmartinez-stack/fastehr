import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { visits, patients, PROVIDERS } from "@/lib/mock-data"
import type { ChartConfig } from "@/components/ui/chart"
import { RevenueChart, VisitsTrendChart, PaymentPieChart } from "./report-charts"
import {
  DollarSignIcon,
  UsersIcon,
  StethoscopeIcon,
  TrendingUpIcon,
} from "lucide-react"

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"]

function kpis() {
  const totalRevenue = visits.reduce((s, v) => s + v.amount, 0)
  const activePatients = patients.filter((p) => p.status === "active").length
  const totalVisits = visits.length
  const avgTicket = totalRevenue / totalVisits
  return { totalRevenue, activePatients, totalVisits, avgTicket }
}

function revenueByMonth() {
  // deterministic pseudo-distribution across months, scaled to total revenue
  const total = visits.reduce((s, v) => s + v.amount, 0)
  const weights = [0.13, 0.15, 0.16, 0.17, 0.19, 0.2]
  return MONTHS.map((month, i) => ({ month, revenue: Math.round((total * (weights[i] ?? 0)) / 100) * 100 }))
}

function visitsByMonth() {
  const base = Math.round(visits.length / 6)
  const deltas = [-3, -1, 1, 2, 4, 6]
  return MONTHS.map((month, i) => ({ month, visits: base + (deltas[i] ?? 0) }))
}

function paymentBreakdown() {
  const map = new Map<string, number>()
  for (const v of visits) map.set(v.paymentMethod, (map.get(v.paymentMethod) ?? 0) + v.amount)
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function providerRows() {
  return PROVIDERS.map((name) => {
    const vs = visits.filter((v) => v.provider === name)
    const revenue = vs.reduce((s, v) => s + v.amount, 0)
    return { name, count: vs.length, revenue }
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

export default function ReportsPage() {
  const k = kpis()
  const payments = paymentBreakdown()
  const paymentConfig = payments.reduce((acc, p, i) => {
    acc[p.name] = { label: p.name, color: `var(--chart-${(i % 5) + 1})` }
    return acc
  }, {} as Record<string, { label: string; color: string }>) satisfies ChartConfig

  const kpiCards = [
    { label: "Total revenue", value: usd(k.totalRevenue), icon: DollarSignIcon, trend: "+12.4%" },
    { label: "Active patients", value: k.activePatients.toString(), icon: UsersIcon, trend: "+5.1%" },
    { label: "Total visits", value: k.totalVisits.toString(), icon: StethoscopeIcon, trend: "+8.7%" },
    { label: "Avg. ticket", value: usd(Math.round(k.avgTicket)), icon: TrendingUpIcon, trend: "+2.3%" },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <PageHeader title="Reports" description="Clinic performance across all offices." />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex flex-col gap-3 py-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <c.icon className="size-4 text-primary" />
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold tabular-nums">{c.value}</span>
                <Badge variant="secondary" className="text-success">
                  {c.trend}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue by month</CardTitle>
            <CardDescription>Gross collections across all offices</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueByMonth()} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment methods</CardTitle>
            <CardDescription>Share of collections</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentPieChart data={payments} config={paymentConfig} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Visit volume</CardTitle>
            <CardDescription>Monthly completed visits</CardDescription>
          </CardHeader>
          <CardContent>
            <VisitsTrendChart data={visitsByMonth()} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Provider productivity</CardTitle>
            <CardDescription>Visits and revenue by provider</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerRows().map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
