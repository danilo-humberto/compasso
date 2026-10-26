import type { ReportRow } from "../../domain/types";
import { formatMinutes, summarize } from "../../domain/time";
import { ContractPunctuality } from "./ContractPunctuality";
import { EmployeeRanking } from "./EmployeeRanking";
import { Chart } from "./Chart";
import { InfoTooltip } from "../shared/InfoTooltip";
import { summarizeReview } from "../../domain/punctuality";
export function Dashboard({
  rows,
  employee,
}: {
  rows: ReportRow[];
  employee: string;
}) {
  const sum = summarize(rows);
  const review = summarizeReview(rows);
  const labels = [
    ...new Set(rows.map((r) => (employee ? r.record.date : r.record.contract))),
  ].sort();
  const groups = labels.map((key) =>
    summarize(
      rows.filter(
        (r) => (employee ? r.record.date : r.record.contract) === key,
      ),
    ),
  );
  return (
    <>
      {sum.pending > 0 && (
        <div className="notice">
          <span>◉</span>
          <div>
            <strong>Alguns dias precisam da sua atenção</strong>
            <p>
              {sum.pending} dias sem cálculo de saldo. Confira as batidas e as
              jornadas antes de comparar os totais.
            </p>
          </div>
        </div>
      )}
      <div className="metrics">
        {[
          {
            label: "Horas registradas",
            value: formatMinutes(sum.recorded),
            detail: "Dias com batidas calculáveis",
            icon: "◷",
            help: "Soma das horas das batidas que permitem calcular a duração do trabalho, incluindo dias sem jornada cadastrada. Não inclui dias com batidas incompletas ou inválidas. Considera os filtros selecionados.",
          },
          {
            label: "Previsto comparável",
            value: formatMinutes(sum.expected),
            detail: "Somente dias com saldo calculado",
            icon: "▤",
            help: "Soma das horas previstas na jornada apenas para os dias com saldo calculado. Dias sem jornada ou com batidas que impedem o cálculo ficam fora da comparação. Considera os filtros selecionados.",
          },
          {
            label: "Saldo informativo",
            value: (sum.balance > 0 ? "+" : "") + formatMinutes(sum.balance),
            detail: `${formatMinutes(sum.worked)} realizadas nos mesmos dias`,
            icon: "↗",
            help: "Diferença entre horas realizadas e previstas nos mesmos dias com saldo calculado. Positivo indica horas a mais; negativo, horas a menos. É informativo e não substitui a apuração da folha. Considera os filtros selecionados.",
          },
          {
            label: "Registros a conferir",
            value: String(review.review).padStart(2, "0"),
            detail: `${review.lateDays} com atraso · ${review.pending + review.unavailable} com pendência`,
            icon: "◉",
            help: "Quantidade de dias por colaborador com atraso ou pendência: batidas incompletas ou inválidas, falta de jornada ou períodos incompatíveis. Cada dia é contado uma vez, mesmo com mais de um motivo. Considera somente registros enviados na planilha e os filtros selecionados.",
          },
        ].map((m) => (
          <article className="metric" key={m.label}>
            <div>
              <span>{m.label}</span>
              <span className="metric-actions">
                <span className="metric-icon" aria-hidden="true">
                  {m.icon}
                </span>
                <InfoTooltip label={m.label}>{m.help}</InfoTooltip>
              </span>
            </div>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </article>
        ))}
      </div>
      <section className="review-summary" aria-label="Conferência do período">
        <h2>O que precisa de conferência</h2>
        <div className="metrics">
          {[
            {
              label: "Dias com atraso",
              value: review.lateDays,
              detail:
                formatMinutes(review.lateMinutes) + " de atraso acumulado",
              help: "Dias com entrada ou retorno após o horário da jornada vigente, sem tolerância automática. Saída mais tarde não apaga o atraso. Batidas incompletas ou sem jornada não são avaliadas. Minutos informativos, sem desconto automático.",
            },
            {
              label: "Batidas a conferir",
              value: review.punches,
              detail: "Incompletas ou fora de ordem",
              help: "Dias cujas batidas não permitem calcular as horas e o saldo com segurança. Confira os horários e os períodos da jornada; as correções entram por uma nova importação.",
            },
            {
              label: "Sem jornada",
              value: review.noSchedule,
              detail: "Sem horário para comparação",
              help: "Dias com horas calculáveis, mas sem jornada vigente. Configure uma jornada do contrato ou uma exceção individual para comparar horas, saldo e atrasos.",
            },
            ...(review.unavailable > 0
              ? [
                  {
                    label: "Períodos a conferir",
                    value: review.unavailable,
                    detail: "Batidas e jornada incompatíveis",
                    help: "Dias com horas calculadas, mas com quantidade de batidas diferente dos períodos da jornada. O atraso fica não avaliado até conferir essa correspondência.",
                  },
                ]
              : []),
          ].map((item) => (
            <article className="metric review-metric" key={item.label}>
              <div>
                <span>{item.label}</span>
                <InfoTooltip label={item.label}>
                  {item.help +
                    " Cada dia de cada colaborador é contado uma vez, conforme os filtros selecionados."}
                </InfoTooltip>
              </div>
              <strong>{String(item.value).padStart(2, "0")}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
      </section>
      <ContractPunctuality rows={rows} />
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{employee ? "Uma visão de cada dia" : "Horas por contrato"}</h2>
            <p>
              Previsto e realizado consideram exatamente os mesmos dias válidos.
            </p>
          </div>
          <span className="badge">VISÃO DO PERÍODO</span>
        </div>
        {rows.length ? (
          <Chart
            labels={labels.map((s) =>
              employee ? s.slice(8) + "/" + s.slice(5, 7) : s,
            )}
            actual={groups.map((g) => g.worked / 60)}
            expected={groups.map((g) => g.expected / 60)}
            line={Boolean(employee)}
          />
        ) : (
          <p className="empty">Importe sua primeira base para começar.</p>
        )}
      </section>
      <EmployeeRanking rows={rows} />
    </>
  );
}
