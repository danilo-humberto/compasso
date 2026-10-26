import type { TimeRecord } from "../../domain/types";
export interface FilterValues {
  month: string;
  contract: string;
  employee: string;
}
export function Filters({
  records,
  value,
  onChange,
}: {
  records: TimeRecord[];
  value: FilterValues;
  onChange: (v: FilterValues) => void;
}) {
  const contracts = [...new Set(records.map((r) => r.contract))].sort();
  const employees = [
    ...new Map(
      records
        .filter((r) => !value.contract || r.contract === value.contract)
        .map((r) => [r.employeeId, r]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="filters">
      <label>
        Mês de referência
        <select
          aria-label="Mês de referência"
          value={value.month}
          onChange={(e) => onChange({ ...value, month: e.target.value })}
        >
          <option value="">Todos os meses</option>
          {[...new Set(records.map((r) => r.date.slice(0, 7)))]
            .sort()
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
        </select>
      </label>
      <label>
        Contrato / localização
        <select
          aria-label="Contrato / localização"
          value={value.contract}
          onChange={(e) =>
            onChange({ ...value, contract: e.target.value, employee: "" })
          }
        >
          <option value="">Todos os contratos</option>
          {contracts.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Colaborador
        <select
          aria-label="Colaborador"
          value={value.employee}
          onChange={(e) => onChange({ ...value, employee: e.target.value })}
        >
          <option value="">Todos os colaboradores</option>
          {employees.map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.name} · {r.employeeId}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
