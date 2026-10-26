import { useState } from "react";
import { useToast } from "../shared/toast/Toast";
import type { Repository } from "../../data/port";
import type { Snapshot } from "../../domain/types";
export function Imports({
  snapshot,
  repository,
  reload,
}: {
  snapshot: Snapshot;
  repository: Repository;
  reload: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function read(file?: File) {
    if (!file || busy) return;
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
      setBusy(false);
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
            disabled={busy}
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
