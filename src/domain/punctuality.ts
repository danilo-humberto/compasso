import type { Punctuality, ReportRow, Schedule, TimeRecord } from "./types";

// Datas civis: UTC apenas como eixo numérico, sem conversão de fuso.
export function punctuality(
  record: TimeRecord,
  schedule?: Schedule,
): Punctuality {
  if (!schedule)
    return {
      kind: "unavailable",
      reason: "Defina uma jornada para avaliar atrasos.",
    };
  const periods =
    schedule.week[new Date(record.date + "T12:00:00Z").getUTCDay()];
  if (!periods.length) return { kind: "not-applicable" };
  const count = record.punches.filter(Boolean).length;
  if (
    count !== periods.length * 2 ||
    !record.punches.slice(0, count).every(Boolean)
  )
    return {
      kind: "unavailable",
      reason:
        "Confira as batidas e os períodos da jornada para avaliar atrasos.",
    };
  const times = record.punches
    .filter((p) => p !== null)
    .map((p) => Date.parse(p.at + "Z") / 60000);
  if (times.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= times[i - 1])))
    return {
      kind: "unavailable",
      reason: "Corrija a ordem das batidas para avaliar atrasos.",
    };
  const base = Date.parse(record.date + "T00:00:00Z") / 60000;
  const clock = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let lastEnd = base;
  const entries = periods.map((period, index) => {
    let start = base + clock(period.start);
    while (start < lastEnd) start += 1440;
    let end = base + clock(period.end);
    while (end <= start) end += 1440;
    lastEnd = end;
    const actual = times[index * 2];
    return {
      label: index === 0 ? "Entrada" : "Retorno",
      expected: new Date(start * 60000).toISOString().slice(0, 16),
      actual: new Date(actual * 60000).toISOString().slice(0, 16),
      minutes: Math.max(0, actual - start),
    };
  });
  return {
    kind: "evaluated",
    minutes: entries.reduce((n, entry) => n + entry.minutes, 0),
    entries,
  };
}

export function needsReview(row: ReportRow) {
  return (
    row.result.kind !== "valid" ||
    row.punctuality.kind === "unavailable" ||
    (row.punctuality.kind === "evaluated" && row.punctuality.minutes > 0)
  );
}

export function summarizeReview(rows: ReportRow[]) {
  const summary = {
    review: 0,
    pending: 0,
    punches: 0,
    noSchedule: 0,
    lateDays: 0,
    lateMinutes: 0,
    unavailable: 0,
  };
  for (const row of rows) {
    if (needsReview(row)) summary.review++;
    if (row.result.kind !== "valid") {
      summary.pending++;
      if (row.result.kind === "no-schedule") summary.noSchedule++;
      else summary.punches++;
    }
    if (row.result.kind === "valid" && row.punctuality.kind === "unavailable")
      summary.unavailable++;
    if (row.punctuality.kind === "evaluated" && row.punctuality.minutes > 0) {
      summary.lateDays++;
      summary.lateMinutes += row.punctuality.minutes;
    }
  }
  return summary;
}
