import { expect, it } from "vitest";
import { report, summarize } from "./time";
import { summarizeReview } from "./punctuality";
import type { Schedule, TimeRecord } from "./types";

const record: TimeRecord = {
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
};
const schedule: Schedule = {
  id: "s",
  label: "Jornada",
  target: "contract",
  targetId: "A",
  week: Array.from({ length: 7 }, () => []),
};

it.each([{ schedules: [] }, { schedules: [schedule] }])(
  "conta sábado sem períodos como extra e dispensa conferência (%j)",
  ({ schedules }) => {
    const rows = report([record], schedules);
    expect(rows[0].result).toEqual({
      kind: "valid",
      worked: 240,
      expected: 0,
      balance: 240,
    });
    expect(summarizeReview(rows).review).toBe(0);
    expect(summarize(rows)).toMatchObject({
      worked: 240,
      expected: 0,
      balance: 240,
      pending: 0,
    });
  },
);

it("prioriza os períodos configurados e a exceção individual", () => {
  const configured = {
    ...schedule,
    week: schedule.week.map((day, i) =>
      i === 6 ? [{ start: "08:00", end: "12:00" }] : day,
    ),
  };
  expect(report([record], [configured])[0].result).toMatchObject({
    expected: 240,
    balance: 0,
  });
  const individual: Schedule = {
    ...schedule,
    id: "i",
    target: "employee",
    targetId: "1",
  };
  expect(report([record], [configured, individual])[0].result).toMatchObject({
    expected: 0,
    balance: 240,
  });
  const two = {
    ...configured,
    week: configured.week.map((day) => [...day, ...day]),
  };
  expect(report([record], [two])[0].result.kind).toBe("pending");
});

it("usa batidas 1 e 2 no sábado sem jornada mesmo havendo outras batidas", () => {
  const extra = {
    ...record,
    punches: [
      ...record.punches.slice(0, 2),
      { at: "2026-08-08T13:00", marked: false },
      { at: "2026-08-08T17:00", marked: false },
    ] as TimeRecord["punches"],
  };
  expect(report([extra], [schedule])[0].result).toMatchObject({
    worked: 240,
    balance: 240,
  });
});

it("mantém pendentes entrada/saída ausentes, inválidas ou invertidas", () => {
  for (const punches of [
    [null, record.punches[1], null, null],
    [record.punches[0], null, null, null],
    [record.punches[1], record.punches[0], null, null],
    [{ at: "inválido", marked: false }, record.punches[1], null, null],
  ]) {
    const rows = report(
      [{ ...record, punches: punches as TimeRecord["punches"] }],
      [],
    );
    expect(rows[0].result.kind).toBe("pending");
    expect(summarizeReview(rows).punches).toBe(1);
  }
});

it("respeita a virada de data e não aplica a regra em outros dias", () => {
  const night = {
    ...record,
    punches: [
      { at: "2026-08-08T22:00", marked: false },
      { at: "2026-08-09T02:00", marked: false },
      null,
      null,
    ] as TimeRecord["punches"],
  };
  expect(report([night], [])[0].result).toMatchObject({
    worked: 240,
    balance: 240,
  });
  expect(
    report([{ ...record, date: "2026-08-09" }], [schedule])[0].result.kind,
  ).toBe("pending");
});
