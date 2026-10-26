import { useEffect, useRef } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
ChartJS.register(...registerables);
ChartJS.defaults.font.size = 14;
export function Chart({
  labels,
  actual,
  expected,
  line = false,
}: {
  labels: string[];
  actual: number[];
  expected: number[];
  line?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new ChartJS(canvas.current, {
      type: line ? "line" : "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Realizado",
            data: actual,
            backgroundColor: "#237e70",
            borderColor: "#237e70",
            borderWidth: 2,
            borderRadius: 4,
          },
          {
            label: "Previsto",
            data: expected,
            backgroundColor: "#d4e7e1",
            borderColor: "#a1bfb4",
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, boxWidth: 8, padding: 20 },
          },
          tooltip: {
            callbacks: {
              label: (c) =>
                `${c.dataset.label}: ${Number(c.raw).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Horas" },
            grid: { color: "#edf1ef" },
          },
          x: { grid: { display: false }, ticks: { maxRotation: 0 } },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, actual, expected, line]);
  return (
    <div className="chart">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Comparação entre horas previstas e realizadas. Os totais também estão disponíveis na tabela de registros."
      />
    </div>
  );
}

export function PieChart({
  contract,
  onTime,
  late,
}: {
  contract: string;
  onTime: number;
  late: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new ChartJS(canvas.current, {
      type: "pie",
      data: {
        labels: ["No horário", "Em atraso"],
        datasets: [
          {
            data: [onTime, late],
            backgroundColor: ["#237e70", "#c35c37"],
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                c.label +
                ": " +
                Number(c.raw) +
                " batidas (" +
                ((Number(c.raw) / (onTime + late)) * 100).toLocaleString(
                  "pt-BR",
                  { maximumFractionDigits: 1 },
                ) +
                "%)",
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [onTime, late]);
  return (
    <div className="pie-chart">
      <canvas
        ref={canvas}
        role="img"
        aria-label={
          contract +
          ": " +
          onTime +
          " batidas no horário e " +
          late +
          " em atraso"
        }
      />
    </div>
  );
}
