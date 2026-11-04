import { useRef, useState } from "react";
import { useToast } from "../shared/toast/Toast";
import type { Repository } from "../../data/port";
import type { Snapshot } from "../../domain/types";
export function Imports({
  snapshot,
  repository,
  reload,
  onReset,
}: {
  snapshot: Snapshot;
  repository: Repository;
  reload: () => Promise<void>;
  onReset?: () => void;
}) {
  const { notify } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const operationRef = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function read(file?: File) {
    if (!file || operationRef.current || dialogRef.current?.open) return;
    operationRef.current = true;
    setError("");
    setBusy(true);
    let saving = false;
    try {
      const { readWorkbook } = await import("../../importing/workbook");
      const incoming = await readWorkbook(file);
      saving = true;
      await repository.importRecords(incoming, snapshot.revision);
      notify({
        action: "updated",
        title: "Importação concluída",
        message: "Base importada com sucesso.",
      });
      await reload();
    } catch (e) {
      setError(
        `Não foi possível importar a base.${e instanceof Error ? ` ${e.message}` : " Tente novamente."}`,
      );
      if (saving) await reload();
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }
  async function reset() {
    if (operationRef.current || !dialogRef.current?.open) return;
    operationRef.current = true;
    setResetting(true);
    setResetError("");
    let completed = false;
    try {
      await repository.resetBase(snapshot.revision);
      completed = true;
      onReset?.();
      dialogRef.current?.close();
      notify({
        action: "deleted",
        title: "Base limpa",
        message:
          "Dados e histórico apagados. Você já pode importar uma nova planilha.",
      });
    } catch (e) {
      setResetError(
        `Não foi possível confirmar a limpeza.${e instanceof Error ? ` ${e.message}` : " Atualize a base antes de tentar novamente."}`,
      );
    } finally {
      try {
        await reload();
      } catch {
        const message = completed
          ? "A base foi limpa, mas não foi possível atualizar a tela. Recarregue a página."
          : "Não foi possível atualizar a base. Recarregue a página antes de tentar novamente.";
        if (completed) setError(message);
        else setResetError(message);
      } finally {
        operationRef.current = false;
        setResetting(false);
      }
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Uma base atualizada. Uma visão melhor.</h2>
            <p>
              Ao selecionar uma planilha, novos registros são adicionados e
              registros da mesma matrícula e data são atualizados. Os meses e
              registros ausentes do arquivo são preservados. Se a importação
              falhar, a base atual é mantida.
            </p>
          </div>
        </div>
        <label className="upload">
          <span>↥</span>
          <strong>Selecione sua planilha de ponto</strong>
          <small>Excel (.xlsx) · até 20 MB · uma aba</small>
          <input
            aria-label="Planilha de ponto"
            type="file"
            accept=".xlsx"
            disabled={busy || resetting}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void read(file);
            }}
          />
        </label>
        {busy && <p role="status">Processando a planilha…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Recomeçar com uma base limpa</h2>
            <p>
              Apague os dados e o histórico de todos os usuários antes de
              importar uma nova base.
            </p>
          </div>
          <button
            type="button"
            className="schedule-confirm-delete"
            disabled={busy || resetting}
            onClick={() => {
              setResetError("");
              setError("");
              dialogRef.current?.showModal();
            }}
          >
            Limpar toda a base
          </button>
        </div>
        <dialog
          ref={dialogRef}
          className="schedule-confirm reset-confirm"
          aria-labelledby="reset-title"
          aria-describedby="reset-description"
          onCancel={(event) => {
            if (operationRef.current) event.preventDefault();
          }}
        >
          <h2 id="reset-title">Limpar toda a base?</h2>
          <p id="reset-description">
            Todos os registros de ponto, colaboradores, contratos e o histórico
            de importações serão apagados para todos os usuários. Os usuários,
            seus acessos e as jornadas cadastradas serão mantidos. Esta ação não
            pode ser desfeita pelo sistema.
          </p>
          {resetError && (
            <p role="alert" className="error">
              {resetError}
            </p>
          )}
          {resetting && (
            <p role="status">Limpando a base. Aguarde a conclusão.</p>
          )}
          <div className="schedule-confirm-actions">
            <button
              type="button"
              autoFocus
              disabled={resetting}
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="schedule-confirm-delete"
              disabled={resetting}
              onClick={() => void reset()}
            >
              Confirmar limpeza
            </button>
          </div>
        </dialog>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Histórico de importações</h2>
            <p>Rastreabilidade de cada atualização da base.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Usuário</th>
                <th>Novos</th>
                <th>Atualizados</th>
                <th>Excluídos</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.imports.map((i) => (
                <tr key={i.id}>
                  <td>{new Date(i.createdAt).toLocaleString("pt-BR")}</td>
                  <td>{i.actorName?.trim() || "Usuário indisponível"}</td>
                  <td>{i.inserted}</td>
                  <td>{i.updated}</td>
                  <td>{i.removed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!snapshot.imports.length && (
            <p className="empty">Nenhuma importação registrada.</p>
          )}
        </div>
      </section>
    </>
  );
}
