import type { ReportRow } from "./types";
export interface EmployeeRank {
  id: string;
  name: string;
  contracts: string[];
  count: number;
  exact: number;
  early: number;
  late: number;
  unavailable: number;
  average: number | null;
}
export function rankEmployees(rows: ReportRow[]): EmployeeRank[] {
  const groups = new Map<string, EmployeeRank & { deviation: number }>();
  for (const { record, punctuality } of rows) {
    const item = groups.get(record.employeeId) ?? {
      id: record.employeeId,
      name: record.name,
      contracts: [],
      count: 0,
      exact: 0,
      early: 0,
      late: 0,
      unavailable: 0,
      average: null,
      deviation: 0,
    };
    if (!item.contracts.includes(record.contract))
      item.contracts.push(record.contract);
    if (punctuality.kind === "evaluated") {
      for (const entry of punctuality.entries) {
        const difference =
          (Date.parse(entry.actual + "Z") - Date.parse(entry.expected + "Z")) /
          60000;
        item.count++;
        item.deviation += Math.abs(difference);
        if (difference === 0) item.exact++;
        else if (difference < 0) item.early++;
        else item.late++;
      }
    } else item.unavailable++;
    groups.set(item.id, item);
  }
  return [...groups.values()]
    .map((item) => ({
      ...item,
      contracts: item.contracts.sort(),
      average: item.count ? item.deviation / item.count : null,
    }))
    .sort(
      (a, b) =>
        (a.average ?? Infinity) - (b.average ?? Infinity) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
}
