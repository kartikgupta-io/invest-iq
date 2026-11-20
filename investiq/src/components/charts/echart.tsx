"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart, CandlestickChart, ScatterChart, RadarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  VisualMapComponent,
  DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LabelLayout, UniversalTransition } from "echarts/features";
import type { EChartsCoreOption } from "echarts/core";
import { cn } from "@/lib/utils";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  CandlestickChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  VisualMapComponent,
  DatasetComponent,
  CanvasRenderer,
  LabelLayout,
  UniversalTransition,
]);

interface EChartProps {
  option: EChartsCoreOption;
  className?: string;
  height?: number | string;
  theme?: string;
}

export function EChart({ option, className, height = 320, theme }: EChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, theme, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
     
  }, [theme]);

  React.useEffect(() => {
    chartRef.current?.setOption(option as EChartsCoreOption, { notMerge: true });
  }, [option]);

  return <div ref={containerRef} className={cn("w-full", className)} style={{ height }} />;
}