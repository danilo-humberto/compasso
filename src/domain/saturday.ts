import type { Schedule, TimeRecord } from "./types";

export function isSaturdayOvertime(record: TimeRecord, schedule?: Schedule) {
  return (
    new Date(record.date + "T12:00:00Z").getUTCDay() === 6 &&
    !schedule?.week[6]?.length
  );
}
