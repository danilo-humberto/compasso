export type Day = string;
export type Punch = { at: string; marked: boolean };
export type Punches = [Punch | null, Punch | null, Punch | null, Punch | null];
export interface TimeRecord {
  employeeId: string;
  name: string;
  contract: string;
  date: Day;
  punchedDate: Day;
  punches: Punches;
  sourceSchedule: string;
}
export interface Period {
  start: string;
  end: string;
}
export interface Schedule {
  id: string;
  label: string;
  target: "contract" | "employee";
  targetId: string;
  week: Period[][];
}
export type Calculation =
  | { kind: "valid"; worked: number; expected: number; balance: number }
  | { kind: "no-schedule"; worked: number }
  | { kind: "pending"; reason: string };
export interface ReportRow {
  record: TimeRecord;
  result: Calculation;
  punctuality: Punctuality;
}
export type Punctuality =
  | { kind: "unavailable"; reason: string }
  | { kind: "not-applicable" }
  | {
      kind: "evaluated";
      minutes: number;
      entries: {
        label: string;
        expected: string;
        actual: string;
        minutes: number;
      }[];
    };
export interface ImportPreview {
  inserted: number;
  updated: number;
  removed: number;
  unchanged: number;
  pending: number;
}
export interface ImportLog {
  id: string;
  createdAt: string;
  actor: string;
  actorName?: string;
  inserted: number;
  updated: number;
  removed: number;
}
export interface Snapshot {
  revision: number;
  records: TimeRecord[];
  schedules: Schedule[];
  imports: ImportLog[];
}
