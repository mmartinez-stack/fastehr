"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config = {
  weight: {
    label: "Weight (lbs)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function WeightChart({
  data,
}: {
  data: { date: string; weight: number }[]
}) {
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={34}
          domain={["dataMin - 5", "dataMax + 5"]}
          fontSize={11}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          dataKey="weight"
          type="monotone"
          stroke="var(--color-weight)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-weight)" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  )
}
