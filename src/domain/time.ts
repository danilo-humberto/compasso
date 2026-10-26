import type { Calculation, ReportRow, Schedule, TimeRecord } from "./types";
import { punctuality } from "./punctuality";
export const formatMinutes = (value: number) =>
  `${value < 0 ? "−" : ""}${String(Math.floor(Math.abs(value) / 60)).padStart(2, "0")}:${String(Math.abs(value) % 60).padStart(2, "0")}`;
const minute = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export function periodMinutes(start: string, end: string) {
  const diff = minute(end) - minute(start);
  return diff < 0 ? diff + 1440 : diff;
}
export function resolveSchedule(record: TimeRecord, schedules: Schedule[]) {
  return schedules
    .filter(
      (s) =>
        s.targetId ===
        (s.target === "employee" ? record.employeeId : record.contract),
    )
    .sort(
      (a, b) =>
        Number(b.target === "employee") - Number(a.target === "employee"),
    )[0];
}
export function calculate(
  record: TimeRecord,
  schedule?: Schedule,
): Calculation {
  const p = record.punches;
  const periods =
    schedule?.week[new Date(record.date + "T12:00:00Z").getUTCDay()];
  const count = p.filter(Boolean).length;
  if (
    count !== 4 &&
    !(count === 2 && p[0] && p[1] && !p[2] && !p[3] && periods?.length === 1)
  )
    return { kind: "pending", reason: "Batidas incompletas para a jornada" };
  const times = p
    .filter((x) => x !== null)
    .map((x) => Date.parse(x.at + "Z") / 60000);
  if (times.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= times[i - 1])))
    return { kind: "pending", reason: "Ordem ou horário de batidas inválido" };
  const worked = times[1] - times[0] + (count === 4 ? times[3] - times[2] : 0);
  if (!periods) return { kind: "no-schedule", worked };
  const expected = periods.reduce(
    (total, p) => total + periodMinutes(p.start, p.end),
    0,
  );
  return { kind: "valid", worked, expected, balance: worked - expected };
}
export function validateSchedule(schedule: Schedule, existing: Schedule[]) {
  if (!schedule.label.trim() || !schedule.targetId.trim())
    throw new Error("Informe nome e destino válidos.");
  if (schedule.week.length !== 7)
    throw new Error("A jornada precisa conter sete dias.");
  for (const day of schedule.week) {
    if (day.length > 2) throw new Error("Use até dois períodos por dia.");
    let last = -1;
    for (const p of day) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) ||
        p.start === p.end
      )
        throw new Error("Horários inválidos.");
      let start = minute(p.start);
      while (start < last) start += 1440;
      const end = start + periodMinutes(p.start, p.end);
      if (end - (day.length ? minute(day[0].start) : 0) > 1440)
        throw new Error(
          "Os períodos não podem se sobrepor ou ultrapassar 24h.",
        );
      last = end;
    }
  }
  if (
    existing.some(
      (s) =>
        s.id !== schedule.id &&
        s.target === schedule.target &&
        s.targetId === schedule.targetId,
    )
  )
    throw new Error(
      "Já existe uma jornada para este destino. Edite a jornada cadastrada.",
    );
}
export function report(
  records: TimeRecord[],
  schedules: Schedule[],
): ReportRow[] {
  const rows: ReportRow[] = records.map((record) => ({
    record,
    result: calculate(record, resolveSchedule(record, schedules)),
    punctuality: punctuality(record, resolveSchedule(record, schedules)),
  }));
  return rows.sort(
    (a, b) =>
      b.record.date.localeCompare(a.record.date) ||
      a.record.name.localeCompare(b.record.name),
  );
}
export function summarize(rows: ReportRow[]) {
  return rows.reduce(
    (s, { result: r }) => {
      if (r.kind === "valid") {
        s.worked += r.worked;
        s.expected += r.expected;
        s.balance += r.balance;
        s.recorded += r.worked;
      } else if (r.kind === "no-schedule") {
        s.recorded += r.worked;
        s.pending++;
      } else s.pending++;
      return s;
    },
    { worked: 0, expected: 0, balance: 0, recorded: 0, pending: 0 },
  );
}
