import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Filters } from "./Filters";
import type { TimeRecord } from "../../domain/types";
afterEach(cleanup);
it("mudar contrato limpa seleção de colaborador", async () => {
  const change = vi.fn();
  const r: TimeRecord = {
    employeeId: "1",
    name: "Teste",
    contract: "A",
    date: "2026-08-01",
    punchedDate: "2026-08-01",
    sourceSchedule: "",
    punches: [null, null, null, null],
  };
  render(
    <Filters
      records={[r]}
      value={{ month: "", contract: "", employee: "1" }}
      onChange={change}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Contrato / localização"),
    "A",
  );
  expect(change).toHaveBeenCalledWith({
    month: "",
    contract: "A",
    employee: "",
  });
});
