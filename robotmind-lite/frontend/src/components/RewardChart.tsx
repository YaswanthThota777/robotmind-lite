import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { TrainingMetric } from "../types";

type RewardChartProps = {
  data: TrainingMetric[];
};

export const RewardChart = ({ data }: RewardChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.map((point) => point.episode),
        datasets: [
          {
            label: "Reward",
            data: data.map((point) => point.reward),
            borderColor: "#22c55e",
            tension: 0.35,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(148, 163, 184, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
          y: {
            grid: {
              color: "rgba(148, 163, 184, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.labels = data.map((point) => point.episode);
    chartRef.current.data.datasets[0].data = data.map((point) => point.reward);
    chartRef.current.update("none");
  }, [data]);

  return <canvas ref={canvasRef} className="h-40 w-full" />;
};

