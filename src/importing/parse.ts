import { calculate, resolveSchedule } from "../domain/time";
import type {
  ImportPreview,
  Punch,
  Schedule,
  TimeRecord,
} from "../domain/types";
const normalize = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
function date(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Data inválida: esperado dia/mês/ano.");
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) throw new Error("Data inválida: esperado dia/mês/ano.");
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const parsed = new Date(iso + "T12:00:00Z");
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    throw new Error("Data inexistente.");
  return iso;
}
function punch(value: unknown): Punch | null {
  if (value === null || value === undefined || value === "") return null;
  const m = /^(\d{2}\/\d{2}\/\d{4})\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(
    String(value)
      .trim()
      .replace(/[D*\s]+$/, ""),
  );
  if (!m) throw new Error("Batida inválida: esperado DD/MM/AAAA HH:mm.");
  return { at: `${date(m[1])}T${m[2]}:${m[3]}`, marked: false };
}
export const recordKey = (r: TimeRecord) =>
  JSON.stringify([r.employeeId, r.date]);
export function parseRows(rows: unknown[][]): TimeRecord[] {
  if (rows.length < 2) throw new Error("Arquivo vazio.");
  const headers = rows[0].map(normalize);
  const required = [
    "matricula",
    "nome",
    "localizacao",
    "data logica",
    "data da batida",
    ...Array.from({ length: 4 }, (_, i) => `data e hora da batida ${i + 1}`),
  ];
  for (const h of required)
    if (headers.filter((x) => x === h).length !== 1)
      throw new Error(`Coluna ausente ou duplicada: ${h}`);
  const records = new Map<string, TimeRecord>();
  rows.slice(1).forEach((row, index) => {
    if (row.every((v) => v === null || v === undefined || v === "")) return;
    try {
      const get = (h: string) => row[headers.indexOf(h)];
      const employeeId = String(get("matricula") ?? "").trim(),
        name = String(get("nome") ?? "").trim(),
        contract = String(get("localizacao") ?? "").trim();
      if (!employeeId || !name || !contract)
        throw new Error("Matrícula, nome e localização são obrigatórios.");
      const r: TimeRecord = {
        employeeId,
        name,
        contract,
        date: date(get("data logica")),
        punchedDate: date(get("data da batida")),
        punches: [
          punch(get(required[5])),
          punch(get(required[6])),
          punch(get(required[7])),
          punch(get(required[8])),
        ],
        sourceSchedule: String(
          get("escala/jornala") ?? get("escala/jornada") ?? "",
        ),
      };
      const key = recordKey(r),
        old = records.get(key);
      if (old && JSON.stringify(old) !== JSON.stringify(r))
        throw new Error("Linhas em conflito para a mesma matrícula/data.");
      records.set(key, r);
    } catch (e) {
      throw new Error(
        `Linha ${index + 2}: ${e instanceof Error ? e.message : "Registro inválido"}`,
      );
    }
  });
  if (!records.size) throw new Error("Arquivo sem registros.");
  if (records.size > 50000)
    throw new Error("Importe até 50.000 registros por arquivo.");
  return [...records.values()];
}
export function previewImport(
  current: TimeRecord[],
  incoming: TimeRecord[],
  schedules: Schedule[],
): ImportPreview {
  const old = new Map(current.map((r) => [recordKey(r), r]));
  const result: ImportPreview = {
    inserted: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    pending: 0,
  };
  for (const r of incoming) {
    const previous = old.get(recordKey(r));
    if (!previous) result.inserted++;
    else if (sameRecord(previous, r)) result.unchanged++;
    else result.updated++;
    if (calculate(r, resolveSchedule(r, schedules)).kind !== "valid")
      result.pending++;
  }
  return result;
}

function sameRecord(a: TimeRecord, b: TimeRecord): boolean {
  return (
    a.employeeId === b.employeeId &&
    a.name === b.name &&
    a.contract === b.contract &&
    a.date === b.date &&
    a.punchedDate === b.punchedDate &&
    a.sourceSchedule === b.sourceSchedule &&
    a.punches.every(
      (p, i) =>
        p?.at === b.punches[i]?.at && p?.marked === b.punches[i]?.marked,
    )
  );
}
