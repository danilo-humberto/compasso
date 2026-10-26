import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ContractPunctuality } from "./ContractPunctuality";
import type { ReportRow } from "../../domain/types";
vi.mock("./Chart", () => ({ PieChart: () => <div data-testid="pie" /> }));
afterEach(cleanup);
const row = (contract: string, minutes: number[] | null): ReportRow => ({
  record: {
    employeeId: "1",
    name: "Pessoa",
    contract,
    date: "2026-09-28",
    punchedDate: "2026-09-28",
    sourceSchedule: "",
    punches: [null, null, null, null],
  },
  result: { kind: "pending", reason: "Teste" },
  punctuality:
    minutes === null
      ? { kind: "unavailable", reason: "Sem jornada" }
      : {
          kind: "evaluated",
          minutes: minutes.reduce((a, b) => a + b, 0),
          entries: minutes.map((m) => ({
            label: "Entrada",
            expected: "2026-09-28T08:00",
            actual: "2026-09-28T08:00",
            minutes: m,
          })),
        },
});
it("conta batidas avaliadas por contrato, sem considerar dias não avaliados como pontuais", () => {
  render(
    <ContractPunctuality
      rows={[
        row("A", [0, 10]),
        row("A", [0, 0]),
        row("A", null),
        row("B", null),
      ]}
    />,
  );
  const a = within(screen.getByRole("article", { name: "Pontualidade: A" }));
  expect(a.getByText("75%")).toBeTruthy();
  expect(a.getByText("25%")).toBeTruthy();
  expect(a.getByText("4 batidas avaliadas")).toBeTruthy();
  expect(a.getByText("1 dia sem avaliação de atraso")).toBeTruthy();
  expect(
    within(screen.getByRole("article", { name: "Pontualidade: B" })).getByText(
      "Sem batidas avaliáveis",
    ),
  ).toBeTruthy();
  expect(screen.getAllByTestId("pie")).toHaveLength(1);
});
it("exibe quatro contratos por página e atualiza com os filtros", async () => {
  const { rerender } = render(
    <ContractPunctuality
      rows={["A", "B", "C", "D", "E"].map((c) => row(c, [0]))}
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(4);
  await userEvent.click(
    screen.getByRole("button", { name: "Próximos contratos" }),
  );
  expect(screen.getByRole("article", { name: "Pontualidade: E" })).toBeTruthy();
  rerender(<ContractPunctuality rows={[row("A", [10])]} />);
  expect(screen.getByRole("article", { name: "Pontualidade: A" })).toBeTruthy();
  expect(screen.getByText("100%")).toBeTruthy();
  rerender(<ContractPunctuality rows={[]} />);
  expect(
    screen.getByText("Nenhum contrato para os filtros selecionados."),
  ).toBeTruthy();
});
