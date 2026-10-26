import { describe, expect, it } from "vitest";
import {
  calculate,
  resolveSchedule,
  formatMinutes,
  report,
  summarize,
  validateSchedule,
} from "./time";
import type { Schedule, TimeRecord } from "./types";
import { punctuality, summarizeReview } from "./punctuality";
export const record: TimeRecord = {
  employeeId: "001",
  name: "Pessoa teste",
  contract: "Contrato A",
  date: "2026-08-03",
  punchedDate: "2026-08-03",
  sourceSchedule: "",
  punches: ["08:00", "12:00", "13:00", "17:00"].map((t) => ({
    at: `2026-08-03T${t}`,
    marked: false,
  })) as TimeRecord["punches"],
};
export const schedule: Schedule = {
  id: "s",
  label: "Comercial",
  target: "contract",
  targetId: "Contrato A",

  week: Array.from({ length: 7 }, () => [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]),
};
describe("cálculos", () => {
  it("mostra atraso na entrada e retorno mesmo com saldo positivo", () => {
    const late = {
      ...record,
      punches: ["08:10", "12:00", "13:05", "18:00"].map((t) => ({
        at: `2026-08-03T${t}`,
        marked: false,
      })) as TimeRecord["punches"],
    };
    expect(calculate(late, schedule)).toMatchObject({ balance: 45 });
    expect(punctuality(late, schedule)).toMatchObject({
      kind: "evaluated",
      minutes: 15,
      entries: [{ minutes: 10 }, { minutes: 5 }],
    });
    expect(summarizeReview(report([late], [schedule]))).toMatchObject({
      review: 1,
      lateDays: 1,
      lateMinutes: 15,
      pending: 0,
    });
  });
  it("não confunde batidas incompletas, folga e falta de jornada com pontualidade", () => {
    expect(punctuality(record)).toMatchObject({ kind: "unavailable" });
    expect(
      punctuality(
        { ...record, punches: [record.punches[0], null, null, null] },
        schedule,
      ),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      punctuality(record, {
        ...schedule,
        week: Array.from({ length: 7 }, () => []),
      }),
    ).toMatchObject({ kind: "not-applicable" });
    expect(punctuality(record, schedule)).toMatchObject({
      kind: "evaluated",
      minutes: 0,
    });
  });
  it("compara horários completos na virada do dia e usa exceção individual", () => {
    const night = {
      ...record,
      punches: [
        "2026-08-03T22:05",
        "2026-08-04T02:00",
        "2026-08-04T03:10",
        "2026-08-04T06:00",
      ].map((at) => ({ at, marked: false })) as TimeRecord["punches"],
    };
    const exception: Schedule = {
      ...schedule,
      id: "night",
      target: "employee",
      targetId: record.employeeId,
      week: Array.from({ length: 7 }, () => [
        { start: "22:00", end: "02:00" },
        { start: "03:00", end: "06:00" },
      ]),
    };
    expect(report([night], [schedule, exception])[0].punctuality).toMatchObject(
      { kind: "evaluated", minutes: 15 },
    );
    const one = {
      ...exception,
      week: Array.from({ length: 7 }, () => [{ start: "22:00", end: "06:00" }]),
    };
    expect(
      punctuality(
        { ...night, punches: [night.punches[0], night.punches[3], null, null] },
        one,
      ),
    ).toMatchObject({ kind: "evaluated", minutes: 5 });
  });
  it("separa motivos de conferência sem duplicar dias", () => {
    const incomplete = {
      ...record,
      employeeId: "002",
      punches: [null, null, null, null] as TimeRecord["punches"],
    };
    const noSchedule = {
      ...record,
      employeeId: "003",
      contract: "Sem jornada",
    };
    expect(
      summarizeReview(report([record, incomplete, noSchedule], [schedule])),
    ).toMatchObject({
      review: 2,
      pending: 2,
      punches: 1,
      noSchedule: 1,
      lateDays: 0,
    });
  });
  it("mantém apenas registros enviados quando um colaborador muda de contrato e retorna", () => {
    const rows = [
      { ...record, date: "2026-08-01" },
      { ...record, date: "2026-08-02", contract: "B" },
      { ...record, date: "2026-08-04", contract: "B" },
      { ...record, date: "2026-08-05" },
    ];
    const result = report(rows, [
      schedule,
      { ...schedule, id: "b", targetId: "B" },
    ]);
    expect(result).toHaveLength(rows.length);
    expect(result.map((r) => r.record)).toEqual([...rows].reverse());
  });
  it("calcula quatro batidas e saldo", () =>
    expect(calculate(record, schedule)).toEqual({
      kind: "valid",
      worked: 480,
      expected: 480,
      balance: 0,
    }));
  it("não confunde falta de jornada com zero", () =>
    expect(calculate(record)).toEqual({ kind: "no-schedule", worked: 480 }));
  it("deixa duas batidas pendentes salvo jornada de um período", () => {
    const r = {
      ...record,
      punches: [
        ...record.punches.slice(0, 2),
        null,
        null,
      ] as TimeRecord["punches"],
    };
    expect(calculate(r, schedule).kind).toBe("pending");
    expect(
      calculate(r, {
        ...schedule,
        week: Array.from({ length: 7 }, () => [
          { start: "08:00", end: "12:00" },
        ]),
      }),
    ).toMatchObject({ worked: 240, balance: 0 });
  });
  it("considera datas na virada do dia", () => {
    const r = {
      ...record,
      punches: [
        { at: "2026-08-03T22:00", marked: false },
        { at: "2026-08-04T06:00", marked: false },
        null,
        null,
      ] as TimeRecord["punches"],
    };
    expect(
      calculate(r, {
        ...schedule,
        week: Array.from({ length: 7 }, () => [
          { start: "22:00", end: "06:00" },
        ]),
      }),
    ).toMatchObject({ worked: 480, expected: 480 });
  });
  it("rejeita ordem inválida e batidas ímpares", () => {
    expect(
      calculate(
        {
          ...record,
          punches: [record.punches[1], record.punches[0], null, null],
        },
        schedule,
      ).kind,
    ).toBe("pending");
    expect(
      calculate(
        { ...record, punches: [record.punches[0], null, null, null] },
        schedule,
      ).kind,
    ).toBe("pending");
  });
  it("não cria dias entre registros e prioriza exceção", () => {
    const end = { ...record, date: "2026-08-05" };
    const exception = {
      ...schedule,
      id: "e",
      target: "employee" as const,
      targetId: "001",
      week: Array.from({ length: 7 }, () => []),
    };
    const rows = report([record, end], [schedule, exception]);
    expect(rows).toHaveLength(2);
    expect(rows[0].result).toMatchObject({ expected: 0 });
    const normal = report([record, end], [schedule]);
    expect(normal).toHaveLength(2);
    expect(summarizeReview(normal).pending).toBe(0);
    expect(summarize(normal).expected).toBe(960);
  });
  it("rejeita duplicidade de destino", () =>
    expect(() =>
      validateSchedule({ ...schedule, id: "new" }, [schedule]),
    ).toThrow(/destino/i));
  it("formata totais acima de 24h", () =>
    expect(formatMinutes(1560)).toBe("26:00"));
});

it("aplica jornada em todas as datas, ignorando limites antigos", () => {
  const legacy = { ...schedule, from: "2026-08-01", to: "2026-08-31" };
  expect(resolveSchedule({ ...record, date: "2025-01-06" }, [legacy])).toBe(
    legacy,
  );
  expect(resolveSchedule({ ...record, date: "2027-01-04" }, [legacy])).toBe(
    legacy,
  );
});
it("rejeita segunda jornada do mesmo destino mesmo com datas antigas separadas", () => {
  const first = { ...schedule, from: "2026-01-01", to: "2026-01-31" };
  const second = { ...schedule, id: "other", from: "2026-02-01", to: null };
  expect(() => validateSchedule(second, [first])).toThrow(/destino/);
});

it("não inventa 29/09 entre linhas de Weslly e mantém linha enviada sem batidas", () => {
  const records = ["2026-09-28", "2026-09-30"].map((date) => ({
    ...record,
    name: "Weslly",
    date,
    punchedDate: date,
    punches: record.punches.map(
      (p) => p && { ...p, at: date + p.at.slice(10) },
    ) as TimeRecord["punches"],
  }));
  const rows = report(records, [schedule]);
  expect(rows.map((r) => r.record.date)).toEqual(["2026-09-30", "2026-09-28"]);
  expect(summarizeReview(rows).review).toBe(0);
  const blank = {
    ...records[0],
    date: "2026-09-29",
    punchedDate: "2026-09-29",
    punches: [null, null, null, null] as TimeRecord["punches"],
  };
  const withBlank = report([...records, blank], [schedule]);
  expect(withBlank).toHaveLength(3);
  expect(withBlank.find((r) => r.record === blank)?.result.kind).toBe(
    "pending",
  );
  expect(summarizeReview(withBlank).punches).toBe(1);
  expect(report([], [schedule])).toEqual([]);
});
