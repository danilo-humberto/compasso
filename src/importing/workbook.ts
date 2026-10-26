import * as XLSX from "xlsx";
import { parseRows } from "./parse";
export async function readWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("Selecione um arquivo .xlsx.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("O arquivo deve ter até 20 MB.");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
  });
  if (workbook.SheetNames.length !== 1)
    throw new Error("Use um arquivo com uma única aba de registros.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[workbook.SheetNames[0]],
    { header: 1, raw: false, dateNF: "dd/mm/yyyy", defval: null },
  );
  return parseRows(rows);
}
