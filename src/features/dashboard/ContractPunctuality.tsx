import { useState } from "react";
import type { ReportRow } from "../../domain/types";
import { PieChart } from "./Chart";
export function ContractPunctuality({ rows }: { rows: ReportRow[] }) {
  const [page, setPage] = useState(0);
  const contracts = new Map<
    string,
    { onTime: number; late: number; unavailable: number }
  >();
  for (const row of rows) {
    const counts = contracts.get(row.record.contract) ?? {
      onTime: 0,
      late: 0,
      unavailable: 0,
    };
    if (row.punctuality.kind === "evaluated") {
      for (const entry of row.punctuality.entries) {
        if (entry.minutes > 0) counts.late++;
        else counts.onTime++;
      }
    } else counts.unavailable++;
    contracts.set(row.record.contract, counts);
  }
  const items = [...contracts].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  const pages = Math.max(1, Math.ceil(items.length / 4));
  const current = Math.min(page, pages - 1);
  const percent = (n: number) =>
    n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  return (
    <section
      className="contract-punctuality"
      aria-label="Pontualidade por contrato"
    >
      <h2>Pontualidade por contrato</h2>
      <p>
        Entradas e retornos avaliáveis. No horário inclui marcações antecipadas;
        saídas não entram no percentual.
      </p>
      <div className="metrics contract-pies">
        {items.slice(current * 4, current * 4 + 4).map(([contract, counts]) => {
          const total = counts.onTime + counts.late;
          const onTime = total
            ? Math.round((counts.onTime / total) * 1000) / 10
            : 0;
          const late = 100 - onTime;
          return (
            <article
              className="panel contract-pie-card"
              aria-label={"Pontualidade: " + contract}
              key={contract}
            >
              <h3>{contract}</h3>
              {total ? (
                <>
                  <PieChart
                    contract={contract}
                    onTime={counts.onTime}
                    late={counts.late}
                  />
                  <dl className="pie-legend">
                    <div>
                      <dt>
                        <span className="pie-dot on-time" />
                        No horário
                      </dt>
                      <dd>{percent(onTime)}</dd>
                    </div>
                    <div>
                      <dt>
                        <span className="pie-dot late" />
                        Em atraso
                      </dt>
                      <dd>{percent(late)}</dd>
                    </div>
                  </dl>
                  <p>{total} batidas avaliadas</p>
                </>
              ) : (
                <p className="empty">Sem batidas avaliáveis</p>
              )}
              {counts.unavailable > 0 && (
                <small>
                  {counts.unavailable}{" "}
                  {counts.unavailable === 1
                    ? "dia sem avaliação de atraso"
                    : "dias sem avaliação de atraso"}
                </small>
              )}
            </article>
          );
        })}
      </div>
      {!items.length && (
        <p className="empty">Nenhum contrato para os filtros selecionados.</p>
      )}
      {pages > 1 && (
        <div className="pagination">
          <small>Quatro contratos por página</small>
          <div>
            <button
              aria-label="Contratos anteriores"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              ←
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              aria-label="Próximos contratos"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
