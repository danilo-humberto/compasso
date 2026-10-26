import { useState } from "react";
import type { ReportRow } from "../../domain/types";
import { rankEmployees, type EmployeeRank } from "../../domain/ranking";
type SortKey = "name" | "count" | "exact" | "early" | "late" | "average";
const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "Colaborador" },
  { key: "count", label: "Batidas avaliadas" },
  { key: "exact", label: "Exatas" },
  { key: "early", label: "Antecipadas" },
  { key: "late", label: "Em atraso" },
  { key: "average", label: "Desvio médio" },
];
export function EmployeeRanking({ rows }: { rows: ReportRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "average",
    asc: true,
  });
  const [page, setPage] = useState(0);
  const ranked = rankEmployees(rows);
  const positions = new Map(
    ranked.filter((r) => r.average !== null).map((r, i) => [r.id, i + 1]),
  );
  const ordered = [...ranked].sort((a, b) => {
    const x = a[sort.key],
      y = b[sort.key];
    if (x === null || y === null)
      return x === y
        ? a.name.localeCompare(b.name, "pt-BR")
        : x === null
          ? 1
          : -1;
    const delta =
      typeof x === "string"
        ? x.localeCompare(String(y), "pt-BR")
        : x - (y as number);
    return (
      delta * (sort.asc ? 1 : -1) ||
      a.name.localeCompare(b.name, "pt-BR") ||
      a.id.localeCompare(b.id)
    );
  });
  const pages = Math.max(1, Math.ceil(ordered.length / 10)),
    current = Math.min(page, pages - 1);
  const format = (item: EmployeeRank) =>
    item.average === null
      ? "Não avaliado"
      : item.average.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) +
        " min";
  return (
    <section
      className="panel employee-ranking"
      aria-label="Ranking de pontualidade"
    >
      <div className="panel-title">
        <div>
          <h2>Ranking de pontualidade</h2>
          <p>
            Menor desvio médio indica maior proximidade do horário previsto.
            Antecipações e atrasos não se compensam.
          </p>
          <p>
            Somente entradas e retornos avaliáveis, conforme os filtros. Exatas
            = mesmo minuto previsto. Saídas não entram no ranking.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table aria-label="Ranking dos colaboradores">
          <thead>
            <tr>
              <th>Posição</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sort.key === column.key
                      ? sort.asc
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    className="ranking-sort"
                    onClick={() => {
                      setSort({
                        key: column.key,
                        asc:
                          sort.key === column.key
                            ? !sort.asc
                            : column.key === "name" || column.key === "average",
                      });
                      setPage(0);
                    }}
                  >
                    {column.label}
                    <span aria-hidden="true">
                      {" "}
                      {sort.key === column.key ? (sort.asc ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
              <th>Dias sem avaliação</th>
            </tr>
          </thead>
          <tbody>
            {ordered.slice(current * 10, current * 10 + 10).map((item) => (
              <tr key={item.id}>
                <td>{positions.get(item.id) ?? "—"}</td>
                <td>
                  <strong>{item.name}</strong>
                  <small>
                    {item.id} · {item.contracts.join(", ")}
                  </small>
                </td>
                <td>{item.count}</td>
                <td>{item.exact}</td>
                <td>{item.early}</td>
                <td>{item.late}</td>
                <td>{format(item)}</td>
                <td>{item.unavailable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ordered.length && (
        <p className="empty">
          Nenhum colaborador para os filtros selecionados.
        </p>
      )}
      {pages > 1 && (
        <footer className="pagination">
          <small>
            {ordered.length} colaboradores · posição pela proximidade
          </small>
          <div>
            <button
              aria-label="Página anterior do ranking"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              ←
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              aria-label="Próxima página do ranking"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              →
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
