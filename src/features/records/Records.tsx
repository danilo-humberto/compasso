import { useState } from "react";
import type { ReportRow } from "../../domain/types";
import { formatMinutes } from "../../domain/time";
import { needsReview } from "../../domain/punctuality";
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export function Records({
  rows,
  compact = false,
}: {
  rows: ReportRow[];
  compact?: boolean;
}) {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState("all");
  const filtered = rows.filter((r) =>
    status === "review"
      ? needsReview(r)
      : status === "late"
        ? r.punctuality.kind === "evaluated" && r.punctuality.minutes > 0
        : status === "pending"
          ? r.result.kind !== "valid"
          : true,
  );
  const size = compact ? 6 : 20;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  return (
    <section className="panel records">
      <div className="panel-title">
        <div>
          <h2>{compact ? "Batidas em detalhe" : "Registros de ponto"}</h2>
          <p>{filtered.length} dias · horários conforme a base importada</p>
        </div>
        <label>
          Situação dos registros
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Todos os dias</option>
            <option value="review">Registros a conferir</option>
            <option value="late">Dias com atraso</option>
            <option value="pending">Sem cálculo de saldo</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Colaborador / contrato</th>
              <th>Data</th>
              <th>Dia da semana</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th>Retorno</th>
              <th>Saída</th>
              <th>Realizado</th>
              <th>Previsto</th>
              <th>Saldo</th>
              <th>Situação</th>
              <th>Atraso / comparação com a jornada</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(current * size, (current + 1) * size)
              .map(({ record: r, result: s, punctuality: p }) => (
                <tr key={r.employeeId + r.date + r.contract}>
                  <td>
                    <strong>{r.name}</strong>
                    <small>
                      {r.contract} · {r.employeeId}
                    </small>
                    {r.sourceSchedule && (
                      <details className="source-schedule">
                        <summary>Escala original</summary>
                        <p>{r.sourceSchedule}</p>
                      </details>
                    )}
                  </td>
                  <td>{r.date.split("-").reverse().join("/")}</td>
                  <td>
                    {weekdays[new Date(r.date + "T12:00:00Z").getUTCDay()]}
                  </td>
                  {r.punches.map((p, i) => (
                    <td
                      key={i}
                      title={
                        p
                          ? `${p.at}${p.marked ? " · marcação original *" : ""}`
                          : ""
                      }
                    >
                      {p ? p.at.slice(11) + (p.marked ? "*" : "") : "—"}
                    </td>
                  ))}
                  <td>
                    {s.kind === "pending" ? "—" : formatMinutes(s.worked)}
                  </td>
                  <td>
                    {s.kind === "valid" ? formatMinutes(s.expected) : "—"}
                  </td>
                  <td>{s.kind === "valid" ? formatMinutes(s.balance) : "—"}</td>
                  <td>
                    <span
                      className={`badge ${s.kind === "valid" ? "ok" : "warning"}`}
                      title={s.kind === "pending" ? s.reason : r.sourceSchedule}
                    >
                      {s.kind === "valid"
                        ? "Calculado"
                        : s.kind === "no-schedule"
                          ? "Sem jornada"
                          : "Conferir batidas"}
                    </span>
                  </td>
                  <td className="punctuality-cell">
                    {p.kind === "evaluated" ? (
                      <>
                        <span
                          className={`badge ${p.minutes > 0 ? "warning" : "ok"}`}
                        >
                          {p.minutes > 0
                            ? `Atraso de ${formatMinutes(p.minutes)}`
                            : "Sem atraso"}
                        </span>
                        {p.entries.map((entry) => (
                          <small key={entry.label}>
                            {entry.label}: previsto {entry.expected.slice(11)} ·
                            registrado {entry.actual.slice(11)}
                            {entry.actual.slice(0, 10) !== r.date &&
                              ` (${entry.actual.slice(0, 10).split("-").reverse().join("/")})`}
                            {entry.expected.slice(0, 10) !== r.date &&
                              ` · previsto em ${entry.expected.slice(0, 10).split("-").reverse().join("/")}`}
                            {entry.minutes > 0 && ` · +${entry.minutes} min`}
                          </small>
                        ))}
                      </>
                    ) : p.kind === "not-applicable" ? (
                      "Folga — sem horário previsto"
                    ) : (
                      <>
                        <span className="badge warning">Não avaliado</span>
                        <small>{p.reason}</small>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="empty">Nenhum registro para os filtros selecionados.</p>
        )}
      </div>
      <footer className="pagination">
        <small>* Marcação preservada do arquivo original.</small>
        <div>
          <button
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label="Página anterior"
          >
            ←
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label="Próxima página"
          >
            →
          </button>
        </div>
      </footer>
    </section>
  );
}
