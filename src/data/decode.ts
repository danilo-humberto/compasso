import type {
  ImportLog,
  Schedule,
  Snapshot,
  TimeRecord,
} from "../domain/types";
import { validateSchedule } from "../domain/time";
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Resposta inválida do servidor.");
  return value as Record<string, unknown>;
}
const string = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Texto inválido na resposta.");
  return value;
};
const number = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Número inválido na resposta.");
  return value;
};
const array = (value: unknown) => {
  if (!Array.isArray(value)) throw new Error("Lista inválida na resposta.");
  return value as unknown[];
};
export function decodeRecord(value: unknown): TimeRecord {
  const r = object(value);
  const punches = array(r.punches).map((v) => {
    if (v === null) return null;
    const p = object(v);
    if (
      typeof p.marked !== "boolean" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(string(p.at))
    )
      throw new Error("Batida inválida na resposta.");
    return { at: string(p.at), marked: p.marked };
  });
  if (punches.length !== 4) throw new Error("Quantidade inválida de batidas.");
  return {
    employeeId: string(r.employeeId),
    name: string(r.name),
    contract: string(r.contract),
    date: string(r.date),
    punchedDate: string(r.punchedDate),
    sourceSchedule: string(r.sourceSchedule),
    punches: [punches[0], punches[1], punches[2], punches[3]],
  };
}
export function decodeSchedule(value: unknown): Schedule {
  const r = object(value);
  if (r.target !== "contract" && r.target !== "employee")
    throw new Error("Destino inválido.");
  const s: Schedule = {
    id: string(r.id),
    label: string(r.label),
    target: r.target,
    targetId: string(r.targetId),
    week: array(r.week).map((day) =>
      array(day).map((p) => {
        const v = object(p);
        return { start: string(v.start), end: string(v.end) };
      }),
    ),
  };
  validateSchedule(s, []);
  return s;
}
export function decodeSnapshot(value: unknown): Snapshot {
  const r = object(value);
  const schedules = array(r.schedules).map(decodeSchedule);
  return {
    revision: number(r.revision),
    records: array(r.records).map(decodeRecord),
    schedules,
    imports: array(r.imports).map((value) => {
      const i = object(value);
      return {
        id: string(i.id),
        createdAt: string(i.createdAt),
        actor: string(i.actor),
        actorName: i.actorName == null ? undefined : string(i.actorName),
        inserted: number(i.inserted),
        updated: number(i.updated),
        removed: number(i.removed),
      } satisfies ImportLog;
    }),
  };
}
