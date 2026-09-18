"use client"

import { useRef } from "react"
import { DownloadIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { XAxisTickContentProps } from "recharts/types/util/types"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

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
 * new year, and after ten four-weekly visits most of them do. The year is
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

/**
 * "Export as image", as the legacy chart offered: the rendered SVG drawn onto
 * a canvas at 2x and handed over as a PNG. No library; the chart is already
 * an SVG in the page. Colours are CSS variables that a detached SVG cannot
 * resolve, so the computed fill and stroke of every element are inlined on
 * a copy first.
 */
async function exportAsPng(container: HTMLElement, fileName: string): Promise<void> {
  const svg = container.querySelector("svg")
  if (!svg) throw new Error("no chart to export")
  const { width, height } = svg.getBoundingClientRect()
  const copy = svg.cloneNode(true) as SVGSVGElement
  const sources = svg.querySelectorAll<SVGElement>("*")
  copy.querySelectorAll<SVGElement>("*").forEach((element, index) => {
    const source = sources[index]
    if (!source) return
    const style = getComputedStyle(source)
    element.setAttribute("fill", style.fill)
    element.setAttribute("stroke", style.stroke)
    if (element.tagName === "text") {
      element.setAttribute("font-family", style.fontFamily)
      element.setAttribute("font-size", style.fontSize)
    }
  })
  copy.setAttribute("width", String(width))
  copy.setAttribute("height", String(height))
  const markup = new XMLSerializer().serializeToString(copy)
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("chart could not be rasterised"))
      image.src = url
    })
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * 2)
    canvas.height = Math.round(height * 2)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no canvas")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const link = document.createElement("a")
    link.download = fileName
    link.href = canvas.toDataURL("image/png")
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Weight per visit as bars (the Sep 7 sync: the bar graph the clinic reads,
 * kept from the legacy record, fixed beside the patient information). A bar
 * per visit reads at a glance which visit moved the number; the line the
 * mockup had smoothed exactly that away.
 */
export function WeightChart({
  data,
  className,
  exportName,
}: {
  /** Oldest first. `date` is an ISO date; the axis owns its formatting. */
  data: { date: string; weight: number }[]
  className?: string
  /** When set, an "Export as image" button saves the chart as `<exportName>.png`. */
  exportName?: string
}) {
  const container = useRef<HTMLDivElement>(null)
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
    <div ref={container} className="flex flex-col gap-2">
      <ChartContainer config={config} className={className ?? "h-[240px] w-full"}>
        <BarChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 8, top: 8, bottom: 16 }}
        barCategoryGap="25%"
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
          domain={["dataMin - 10", "dataMax + 5"]}
          fontSize={11}
        />
        <ChartTooltip
          cursor={{ fill: "color-mix(in oklab, var(--foreground) 6%, transparent)" }}
          content={
            <ChartTooltipContent labelFormatter={(value) => fmtDateLong(String(value))} />
          }
        />
        <Bar dataKey="weight" fill="var(--color-weight)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
      </ChartContainer>
      {exportName !== undefined && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!container.current) return
              exportAsPng(container.current, `${exportName}.png`).catch(() =>
                toast.error("The chart could not be exported."),
              )
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Export as image
          </Button>
        </div>
      )}
    </div>
  )
}
