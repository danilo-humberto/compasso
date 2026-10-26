import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Repository } from "../../data/port";
import type { Schedule, Snapshot } from "../../domain/types";
import { validateSchedule } from "../../domain/time";
import { useToast } from "../shared/toast/Toast";
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const blank = (): Schedule => ({
  id: crypto.randomUUID(),
  label: "",
  target: "contract",
  targetId: "",
  week: Array.from({ length: 7 }, () => []),
});
export function Schedules({
  snapshot,
  repository,
  reload,
}: {
  snapshot: Snapshot;
  repository: Repository;
  reload: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [draft, setDraft] = useState<Schedule>(blank),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pendingDelete, setPendingDelete] = useState<Schedule | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      deleteTriggerRef.current?.focus();
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingDelete]);
  const choices =
    draft.target === "contract"
      ? [...new Set(snapshot.records.map((r) => r.contract))]
          .sort()
          .map((c) => ({ id: c, label: c }))
      : [
          ...new Map(
            snapshot.records.map((r) => [
              r.employeeId,
              { id: r.employeeId, label: `${r.name} · ${r.employeeId}` },
            ]),
          ).values(),
        ];
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      validateSchedule(draft, snapshot.schedules);
      setBusy(true);
      await repository.saveSchedule(draft, snapshot.revision);
      setDraft(blank());
      notify({
        action: snapshot.schedules.some((s) => s.id === draft.id)
          ? "updated"
          : "added",
        title: snapshot.schedules.some((s) => s.id === draft.id)
          ? "Jornada atualizada"
          : "Jornada adicionada",
        message:
          "Jornada salva. Os horários serão aplicados a todas as datas da base.",
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!pendingDelete || busy) return;
    setBusy(true);
    setError("");
    try {
      await repository.deleteSchedule(pendingDelete.id, snapshot.revision);
      if (draft.id === pendingDelete.id) setDraft(blank());
      setPendingDelete(null);
      notify({
        action: "deleted",
        title: "Jornada excluída",
        message: "Jornada removida. Os cálculos serão atualizados.",
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir.");
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>
              {snapshot.schedules.some((s) => s.id === draft.id)
                ? "Editar jornada"
                : "Configurar uma jornada"}
            </h2>
            <p>
              A jornada individual prevalece sobre a do contrato. Os horários se
              aplicam a todas as datas da base.
            </p>
          </div>
          <button
            disabled={busy || !!pendingDelete}
            onClick={() => {
              setDraft(blank());
              setError("");
            }}
          >
            Nova jornada
          </button>
        </div>
        <form onSubmit={save}>
          <fieldset
            className="schedule-fields"
            disabled={busy || !!pendingDelete}
          >
            <div className="form-grid">
              <label>
                Nome da jornada
                <input
                  required
                  value={draft.label}
                  onChange={(e) =>
                    setDraft({ ...draft, label: e.target.value })
                  }
                  placeholder="Ex.: Comercial · 40h"
                />
              </label>
              <label>
                Aplicar a
                <select
                  aria-label="Aplicar a"
                  value={draft.target}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      target:
                        e.target.value === "employee" ? "employee" : "contract",
                      targetId: "",
                    })
                  }
                >
                  <option value="contract">Contrato / localização</option>
                  <option value="employee">Colaborador (exceção)</option>
                </select>
              </label>
              <label>
                Destino
                <select
                  aria-label="Destino"
                  required
                  value={draft.targetId}
                  onChange={(e) =>
                    setDraft({ ...draft, targetId: e.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="week">
              {days.map((day, d) => (
                <div className="week-day" key={day}>
                  <strong>{day}</strong>
                  <select
                    aria-label={`Períodos de ${day}`}
                    value={draft.week[d].length}
                    onChange={(e) => {
                      const week = structuredClone(draft.week);
                      week[d] =
                        Number(e.target.value) === 0
                          ? []
                          : Number(e.target.value) === 1
                            ? [{ start: "08:00", end: "12:00" }]
                            : [
                                { start: "08:00", end: "12:00" },
                                { start: "13:00", end: "17:00" },
                              ];
                      setDraft({ ...draft, week });
                    }}
                  >
                    <option value="0">Folga</option>
                    <option value="1">1 período</option>
                    <option value="2">2 períodos</option>
                  </select>
                  {draft.week[d].map((p, i) => (
                    <div className="period" key={i}>
                      {(["start", "end"] as const).map((field) => (
                        <label key={field}>
                          {field === "start" ? "Entrada" : "Saída"} {i + 1}
                          <input
                            type="time"
                            required
                            value={p[field]}
                            onChange={(e) => {
                              const week = structuredClone(draft.week);
                              week[d][i][field] = e.target.value;
                              setDraft({ ...draft, week });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="muted">
              Saída anterior à entrada indica passagem pela meia-noite. Dias de
              um período aceitam duas batidas.
            </p>
            {error && !pendingDelete && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar jornada"}
            </button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Jornadas cadastradas</h2>
            <p>
              Selecione uma jornada para consultar ou ajustar sua configuração.
            </p>
          </div>
        </div>
        {pendingDelete && (
          <dialog
            ref={dialogRef}
            className="schedule-confirm"
            aria-describedby="schedule-delete-description"
            onCancel={(event) => {
              event.preventDefault();
              if (!busy) setPendingDelete(null);
            }}
            aria-label="Confirmar exclusão de jornada"
          >
            <h2>Excluir a jornada “{pendingDelete.label}”?</h2>
            <p id="schedule-delete-description">
              Os registros de ponto serão mantidos. Os saldos e atrasos serão
              recalculados com as jornadas restantes. Esta exclusão não pode ser
              desfeita pelo sistema.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="schedule-confirm-actions">
              <button
                type="button"
                disabled={busy}
                ref={cancelRef}
                onClick={() => setPendingDelete(null)}
              >
                Cancelar exclusão
              </button>
              <button
                type="button"
                className="schedule-confirm-delete"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </dialog>
        )}
        <div className="schedule-list">
          {snapshot.schedules.map((s) => (
            <div className="schedule-card" key={s.id}>
              <button
                className="schedule-edit"
                disabled={busy || !!pendingDelete}
                onClick={() => {
                  setDraft(structuredClone(s));
                  setError("");
                }}
              >
                <strong>{s.label}</strong>
                <span>
                  {s.target === "contract" ? "Contrato" : "Colaborador"} ·{" "}
                  {s.targetId}
                </span>
              </button>
              <button
                type="button"
                className="schedule-delete"
                aria-label={`Excluir jornada ${s.label}`}
                title="Excluir jornada"
                disabled={busy}
                onClick={(event) => {
                  deleteTriggerRef.current = event.currentTarget;
                  setError("");
                  setPendingDelete(s);
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {!snapshot.schedules.length && (
          <p className="empty">
            Nenhuma jornada cadastrada. Use as escalas originais na tabela como
            referência.
          </p>
        )}
      </section>
    </>
  );
}
