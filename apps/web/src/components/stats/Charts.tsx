"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useThemeColors } from "@/hooks/useColorScheme";
import { axisTheme, seriesColors } from "./chart-colors";

type Datum = Record<string, string | number>;

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  format?: (v: number) => string;
}

function useAxis() {
  const c = useThemeColors();
  const t = axisTheme(c);
  return {
    c,
    t,
    axisProps: { stroke: t.grid, tick: { fill: t.tick, fontSize: 12 }, tickLine: false, axisLine: false } as const,
    palette: seriesColors(c),
  };
}

interface TooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
}

interface TooltipBoxProps {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  series: SeriesDef[];
  labelFormat?: (l: string) => string;
}

function TooltipBox({ active, payload, label, series, labelFormat }: TooltipBoxProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{labelFormat ? labelFormat(String(label)) : String(label ?? payload[0]?.name ?? "")}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey) ?? series[0];
        const v = Number(p.value);
        return (
          <p key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 text-ink-muted">
            <span className="inline-block size-2.5 rounded-full" style={{ background: p.color ?? s?.color }} aria-hidden="true" />
            <span>{s && series.length > 1 ? s.label : String(p.name ?? "")}</span>
            <span className="ml-auto pl-3 font-medium text-ink tabular-nums">{s?.format ? s.format(v) : v.toLocaleString("es-MX")}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Serie temporal: área para una métrica, líneas para varias (un solo eje Y). */
export function TimeSeriesChart({ data, xKey, series, labelFormat, yFormat, integerY }: { data: Datum[]; xKey: string; series: SeriesDef[]; labelFormat?: (l: string) => string; yFormat?: (v: number) => string; integerY?: boolean }) {
  const { t, axisProps, palette, c } = useAxis();
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? palette[i % palette.length]! }));
  if (colored.length === 1) {
    const s = colored[0]!;
    const gid = `grad-${s.key}`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={labelFormat} minTickGap={24} />
          <YAxis {...axisProps} width={56} tickFormatter={yFormat} allowDecimals={!integerY} />
          <Tooltip content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TooltipEntry[] | undefined} label={p.label} series={colored} labelFormat={labelFormat} />} cursor={{ stroke: t.tick, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${gid})`} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={labelFormat} minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={yFormat} allowDecimals={!integerY} />
        <Tooltip content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TooltipEntry[] | undefined} label={p.label} series={colored} labelFormat={labelFormat} />} cursor={{ stroke: t.tick, strokeDasharray: "3 3" }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: t.tick }} />
        {colored.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras de una métrica. `colorFor` permite colorear por entidad (p. ej. modo). */
export function BarChartView({ data, xKey, series, horizontal, colorFor, labelFormat }: { data: Datum[]; xKey: string; series: SeriesDef; horizontal?: boolean; colorFor?: (d: Datum) => string; labelFormat?: (l: string) => string }) {
  const { t, axisProps, palette, c } = useAxis();
  const color = series.color ?? palette[0]!;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 8 : 0, bottom: 0 }} barCategoryGap={horizontal ? 6 : "18%"}>
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} stroke={t.grid} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} tickFormatter={series.format} allowDecimals={false} />
            <YAxis type="category" dataKey={xKey} {...axisProps} width={120} tickFormatter={labelFormat} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axisProps} tickFormatter={labelFormat} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={48} tickFormatter={series.format} />
          </>
        )}
        <Tooltip content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TooltipEntry[] | undefined} label={p.label} series={[series]} labelFormat={labelFormat} />} cursor={{ fill: t.cursor, fillOpacity: 0.08 }} />
        <Bar dataKey={series.key} name={series.label} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} stroke={c.surface} strokeWidth={1}>
          {colorFor && data.map((d, i) => <Cell key={i} fill={colorFor(d)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona para participación (≤6 categorías). Leyenda siempre visible. */
export function DonutChart({ data, nameKey, valueKey, colorFor, format }: { data: Datum[]; nameKey: string; valueKey: string; colorFor: (d: Datum, i: number) => string; format?: (v: number) => string }) {
  const { t, c } = useAxis();
  const series: SeriesDef[] = [{ key: valueKey, label: valueKey, format }];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="85%" paddingAngle={1.5} stroke={c.surface} strokeWidth={2}>
          {data.map((d, i) => <Cell key={i} fill={colorFor(d, i)} />)}
        </Pie>
        <Tooltip content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TooltipEntry[] | undefined} label={p.label} series={series} />} />
        <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12, color: t.tick }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
