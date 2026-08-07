"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
} from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RevenueChart({ data }: { data: { month: string; revenue: number }[] }) {
  return (
    <ChartContainer config={revenueConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

const visitsConfig = {
  visits: { label: "Visits", color: "var(--chart-2)" },
} satisfies ChartConfig

export function VisitsTrendChart({ data }: { data: { month: string; visits: number }[] }) {
  return (
    <ChartContainer config={visitsConfig} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="visits"
          type="monotone"
          stroke="var(--color-visits)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"]

export function PaymentPieChart({
  data,
  config,
}: {
  data: { name: string; value: number }[]
  config: ChartConfig
}) {
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-64">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} strokeWidth={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  )
}
