import { expect, it } from "vitest";
import { rankEmployees } from "./ranking";
import type { ReportRow } from "./types";
const row = (id: string, actual: string[] | null): ReportRow => ({
  record: {
    employeeId: id,
    name: "Pessoa " + id,
    contract: "A",
    date: "2026-09-28",
    punchedDate: "2026-09-28",
    sourceSchedule: "",
    punches: [null, null, null, null],
  },
  result: { kind: "pending", reason: "Teste" },
  punctuality: actual
    ? {
        kind: "evaluated",
        minutes: 0,
        entries: actual.map((at) => ({
          label: "Entrada",
          expected: "2026-09-28T08:00",
          actual: at,
          minutes: 0,
        })),
      }
    : { kind: "unavailable", reason: "Sem jornada" },
});
it("ordena por desvio absoluto médio, contando antecipações e atrasos sem compensação", () => {
  const result = rankEmployees([
    row("longe", ["2026-09-28T07:50", "2026-09-28T08:10"]),
    row("exato", ["2026-09-28T08:00"]),
    row("perto", ["2026-09-28T08:01"]),
    row("sem", null),
  ]);
  expect(result.map((r) => r.id)).toEqual(["exato", "perto", "longe", "sem"]);
  expect(result[2]).toMatchObject({
    average: 10,
    early: 1,
    late: 1,
    exact: 0,
    count: 2,
  });
  expect(result[3].average).toBeNull();
});
it("agrupa por matrícula, pondera por batidas e respeita datas completas", () => {
  const result = rankEmployees([
    row("1", ["2026-09-28T08:00", "2026-09-28T08:00"]),
    {
      ...row("1", ["2026-09-29T08:00"]),
      record: { ...row("1", null).record, contract: "B" },
    },
    row("1", null),
  ]);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    average: 480,
    count: 3,
    exact: 2,
    late: 1,
    unavailable: 1,
    contracts: ["A", "B"],
  });
  expect(rankEmployees([])).toEqual([]);
});
