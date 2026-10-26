import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Records } from "./Records";
import { report } from "../../domain/time";

afterEach(cleanup);
it("mostra sábado sem jornada como hora extra calculada", () => {
  render(
    <Records
      rows={report(
        [
          {
            employeeId: "1",
            name: "Teste",
            contract: "A",
            date: "2026-08-08",
            punchedDate: "2026-08-08",
            sourceSchedule: "",
            punches: [
              { at: "2026-08-08T08:00", marked: false },
              { at: "2026-08-08T12:00", marked: false },
              null,
              null,
            ],
          },
        ],
        [],
      )}
    />,
  );
  expect(screen.getByText("Hora extra")).toBeTruthy();
  expect(screen.queryByText("Conferir batidas")).toBeNull();
  expect(screen.getAllByText("04:00")).toHaveLength(2);
  expect(screen.getByText("00:00")).toBeTruthy();
});
it.each([false, true])(
  "mostra dia da data lógica ao lado da data (compacto: %s)",
  (compact) => {
    const rows = report(
      ["2026-08-02", "2026-08-03", "2026-08-08"].map((date) => ({
        employeeId: "1",
        name: "Pessoa teste",
        contract: "A",
        date,
        punchedDate: "2026-08-09",
        sourceSchedule: "",
        punches: [null, null, null, null],
      })),
      [],
    );
    render(<Records rows={rows} compact={compact} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers[1].textContent).toBe("Data");
    expect(headers[2].textContent).toBe("Dia da semana");
    screen
      .getAllByRole("row")
      .slice(1)
      .forEach((row) => {
        expect(within(row).getAllByRole("cell")[2].textContent).toBe(
          (
            {
              "02/08/2026": "Domingo",
              "03/08/2026": "Segunda-feira",
              "08/08/2026": "Sábado",
            } as Record<string, string>
          )[within(row).getAllByRole("cell")[1].textContent!],
        );
      });
  },
);
