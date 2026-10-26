import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect } from "vitest";
import { EmployeeRanking } from "./EmployeeRanking";
import type { ReportRow } from "../../domain/types";
afterEach(cleanup);
const row = (id: string, late: boolean): ReportRow => ({
  record: {
    employeeId: id,
    name: "Pessoa " + id,
    contract: "A",
    date: "2026-09-28",
    punchedDate: "2026-09-28",
    sourceSchedule: "",
    punches: [null, null, null, null],
  },
  result: { kind: "valid", worked: 480, expected: 480, balance: 0 },
  punctuality: {
    kind: "evaluated",
    minutes: late ? 5 : 0,
    entries: [
      {
        label: "Entrada",
        actual: "2026-09-28T08:" + (late ? "05" : "00"),
        expected: "2026-09-28T08:00",
        minutes: late ? 5 : 0,
      },
    ],
  },
});
it("ordena pelo cabeçalho nos dois sentidos sem mudar a posição por proximidade", async () => {
  render(<EmployeeRanking rows={[row("A", true), row("B", false)]} />);
  const first = () =>
    within(screen.getAllByRole("row")[1]).getAllByRole("cell");
  expect(first()[1].textContent).toContain("Pessoa B");
  await userEvent.click(screen.getByRole("button", { name: "Em atraso" }));
  expect(first()[1].textContent).toContain("Pessoa A");
  expect(first()[0].textContent).toBe("2");
  expect(
    screen
      .getByRole("columnheader", { name: /Em atraso/ })
      .getAttribute("aria-sort"),
  ).toBe("descending");
  await userEvent.click(screen.getByRole("button", { name: "Em atraso" }));
  expect(first()[1].textContent).toContain("Pessoa B");
  await userEvent.click(screen.getByRole("button", { name: "Colaborador" }));
  expect(first()[1].textContent).toContain("Pessoa A");
});
it("pagina e atualiza a lista quando os filtros mudam", async () => {
  const { rerender } = render(
    <EmployeeRanking
      rows={Array.from({ length: 11 }, (_, i) =>
        row(String(i).padStart(2, "0"), false),
      )}
    />,
  );
  expect(screen.getAllByRole("row")).toHaveLength(11);
  await userEvent.click(
    screen.getByRole("button", { name: "Próxima página do ranking" }),
  );
  expect(screen.getByText("Pessoa 10")).toBeTruthy();
  rerender(<EmployeeRanking rows={[row("A", true)]} />);
  expect(screen.getByText("Pessoa A")).toBeTruthy();
  rerender(<EmployeeRanking rows={[]} />);
  expect(
    screen.getByText("Nenhum colaborador para os filtros selecionados."),
  ).toBeTruthy();
});
