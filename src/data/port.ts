import type { Schedule, Snapshot, TimeRecord } from "../domain/types";
export interface Repository {
  deleteSchedule(id: string, revision: number): Promise<void>;
  load(): Promise<Snapshot>;
  importRecords(records: TimeRecord[], revision: number): Promise<void>;
  saveSchedule(schedule: Schedule, revision: number): Promise<void>;
}
