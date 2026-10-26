import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import { report } from "../../domain/time";
import type { Schedule, TimeRecord } from "../../domain/types";
vi.mock("./Chart", () => ({
  Chart: () => <div>Gráfico</div>,
  PieChart: () => <div>Pizza</div>,
}));
afterEach(cleanup);
const schedule: Schedule = {
  id: "s",
  label: "Comercial",
  target: "contract",
  targetId: "A",

  week: Array.from({ length: 7 }, () => [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]),
};
const record = (id: string, start: string): TimeRecord => ({
  employeeId: id,
  name: `Pessoa ${id}`,
  contract: "A",
  date: "2026-08-03",
  punchedDate: "2026-08-03",
  sourceSchedule: "",
  punches: [start, "12:00", "13:00", "18:00"].map((t) => ({
    at: `2026-08-03T${t}`,
    marked: false,
  })) as TimeRecord["punches"],
});
it("mantém indicadores sem duplicar a tabela de registros", () => {
  const rows = report(
    [
      record("1", "08:10"),
      record("2", "08:00"),
      { ...record("3", "08:00"), contract: "B" },
    ],
    [schedule],
  );
  render(<Dashboard rows={rows} employee="" />);
  const card = screen
    .getByText("Registros a conferir", { selector: "span" })
    .closest("article");
  expect(card?.textContent).toContain("02");
  expect(card?.textContent).toContain("1 com atraso · 1 com pendência");
  expect(screen.getByText("00:10 de atraso acumulado")).toBeTruthy();
  expect(
    screen.getByRole("table", { name: "Ranking dos colaboradores" }),
  ).toBeTruthy();
  expect(screen.queryByText("Batidas em detalhe")).toBeNull();
});
it("recalcula conferência ao receber os filtros do painel", () => {
  const { rerender } = render(
    <Dashboard
      rows={report([record("1", "08:10")], [schedule])}
      employee="1"
    />,
  );
  expect(screen.getByText("00:10 de atraso acumulado")).toBeTruthy();
  rerender(
    <Dashboard
      rows={report([record("2", "08:00")], [schedule])}
      employee="2"
    />,
  );
  expect(screen.queryByText("00:10 de atraso acumulado")).toBeNull();
  expect(screen.getByText("00:00 de atraso acumulado")).toBeTruthy();
});
