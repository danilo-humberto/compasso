import { expect, it } from "vitest";
import { parseRows, previewImport } from "./parse";
import { decodeRecord } from "../data/decode";
const headers = [
  "Matrícula",
  "Nome",
  "CPF",
  "Localização",
  "Data Lógica",
  "Data da Batida",
  "Data e Hora da Batida 1",
  "Data e Hora da Batida 2",
  "Data e Hora da Batida 3",
  "Data e Hora da Batida 4",
  "Escala/Jornala",
];
const row = [
  "001",
  "Pessoa sintética",
  "IGNORAR",
  "Contrato A",
  "03/08/2026",
  "03/08/2026",
  "03/08/2026 08:00*",
  "03/08/2026 12:00",
  "03/08/2026 13:00",
  "03/08/2026 17:00",
  "Comercial",
];
it("normaliza sem carregar CPF e remove asterisco", () => {
  const r = parseRows([headers, row]);
  expect(r[0].employeeId).toBe("001");
  expect(r[0].punches[0]).toEqual({ at: "2026-08-03T08:00", marked: false });
  expect(JSON.stringify(r)).not.toContain("IGNORAR");
});
it("rejeita arquivo vazio, data impossível e conflito", () => {
  expect(() => parseRows([])).toThrow();
  expect(() =>
    parseRows([headers, [...row.slice(0, 4), "31/02/2026", ...row.slice(5)]]),
  ).toThrow();
  expect(() =>
    parseRows([
      headers,
      row,
      [...row.slice(0, 1), "Outro nome", ...row.slice(2)],
    ]),
  ).toThrow(/conflito/i);
});
it("reimportação é idempotente e importação incremental não conta exclusões", () => {
  const records = parseRows([headers, row]);
  expect(previewImport(records, records, [])).toMatchObject({
    inserted: 0,
    updated: 0,
    unchanged: 1,
  });
  const incoming = [{ ...records[0], employeeId: "new" }];
  expect(previewImport(records, incoming, [])).toMatchObject({
    removed: 0,
    inserted: 1,
  });
});
it("reimportação após leitura do banco não depende da ordem das propriedades", () => {
  const incoming = parseRows([headers, row]);
  expect(previewImport(incoming.map(decodeRecord), incoming, [])).toMatchObject(
    { updated: 0, unchanged: 1 },
  );
});

it.each(["D", "*", "D*", "*D", " D * "])(
  "remove sufixo %s preservando data e horário",
  (suffix) => {
    const input = [...row];
    input[9] = "04/08/2026 00:02" + suffix;
    const result = parseRows([headers, input]);
    expect(result[0].punches[3]).toEqual({
      at: "2026-08-04T00:02",
      marked: false,
    });
  },
);
it.each([
  "03/08/2026 25:00D",
  "31/02/2026 08:00*",
  "03/08/2026 08:00X",
  "03/08/2026 0D:00",
  "D",
  "*",
])("não mascara batida inválida %s", (value) => {
  const input = [...row];
  input[6] = value;
  expect(() => parseRows([headers, input])).toThrow(/Linha 2/);
});
it("mantém batidas ausentes como pendências", () => {
  const input: unknown[] = [...row];
  input[6] = null;
  input[7] = "";
  expect(parseRows([headers, input])[0].punches.slice(0, 2)).toEqual([
    null,
    null,
  ]);
});
