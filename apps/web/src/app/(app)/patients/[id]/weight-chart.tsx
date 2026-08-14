"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { XAxisTickContentProps } from "recharts/types/util/types"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { fmtDate, fmtDateLong } from "@/lib/mock-data"

const config = {
  weight: {
    label: "Weight (lbs)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

/**
 * Axis labels for the patient history.
 *
 * The Aug 7 sync asked for the year to be stated on this axis. It had read
 * "Mar 3 … Aug 4", which is unreadable for a patient whose history crosses a
 * new year — and after ten four-weekly visits most of them do. The year is
 * printed under the first tick and under every tick that opens a new year, so
 * it appears exactly where it changes something rather than repeating on all
 * ten and crowding them out.
 */
function axisLabels(dates: string[]): Map<string, { day: string; year?: string }> {
  const labels = new Map<string, { day: string; year?: string }>()
  let previousYear: number | undefined
  for (const iso of dates) {
    const year = new Date(iso).getFullYear()
    labels.set(iso, {
      day: fmtDate(iso),
      year: year === previousYear ? undefined : String(year),
    })
    previousYear = year
  }
  return labels
}

export function WeightChart({
  data,
}: {
  /** Oldest first. `date` is an ISO date; the axis owns its formatting. */
  data: { date: string; weight: number }[]
}) {
  const labels = axisLabels(data.map((d) => d.date))

  function renderTick({ x, y, payload }: XAxisTickContentProps) {
    const label = labels.get(String(payload.value))
    if (!label) return null
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          y={0}
          dy={12}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted-foreground)"
        >
          {label.day}
        </text>
        {label.year && (
          <text
            y={0}
            dy={26}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--foreground)"
          >
            {label.year}
          </text>
        )}
      </g>
    )
  }

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 12, top: 8, bottom: 16 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={renderTick}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={34}
          domain={["dataMin - 5", "dataMax + 5"]}
          fontSize={11}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent labelFormatter={(value) => fmtDateLong(String(value))} />
          }
        />
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
