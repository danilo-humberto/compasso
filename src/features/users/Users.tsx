import { useToastMessage } from "../shared/toast/Toast";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  inviteUser,
  listUsers,
  setUserRole,
  revokeUserAccess,
  type Access,
  type AppUser,
} from "../auth/access";
export function Users() {
  const setError = useToastMessage("error");
  const setMessage = useToastMessage("updated");
  const showInvite = useToastMessage("added", "Convite enviado");
  const showDeleted = useToastMessage("deleted", "Usuário excluído");
  const setRevokeError = useToastMessage("error");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Access["role"]>("reader");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingRevoke, setPendingRevoke] = useState<AppUser | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const revoking = useRef(false);
  const focusAfterRevoke = useRef(false);
  useEffect(() => {
    if (!busy && focusAfterRevoke.current) {
      focusAfterRevoke.current = false;
      refreshRef.current?.focus();
    }
  }, [busy]);
  useEffect(() => {
    if (pendingRevoke) dialogRef.current?.showModal();
  }, [pendingRevoke]);
  async function revoke() {
    if (!pendingRevoke || revoking.current) return;
    revoking.current = true;
    setBusy(true);
    try {
      await revokeUserAccess(pendingRevoke.id);
      setUsers((current) =>
        current.filter((user) => user.id !== pendingRevoke.id),
      );
      showDeleted(`Conta de ${pendingRevoke.email} excluída.`);
      dialogRef.current?.close();
      // A ação de revogar desaparece; o foco volta para um controle estável.
      focusAfterRevoke.current = true;
    } catch (e) {
      setRevokeError(
        e instanceof Error
          ? e.message
          : "Não foi possível revogar o acesso. Tente novamente.",
      );
    } finally {
      revoking.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void listUsers().then(
      (data) => {
        if (active) {
          setUsers(data);
          setLoading(false);
        }
      },
      (e: Error) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [setError]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await inviteUser(email.trim(), role);
      setEmail("");
      showInvite("A pessoa receberá um e-mail para definir sua senha.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível enviar o convite.",
      );
    }
    try {
      await reload();
    } catch {
      setError("Não foi possível atualizar a lista de usuários.");
    }
    setBusy(false);
  }
  async function changeRole(user: AppUser, next: Access["role"]) {
    setBusy(true);
    try {
      await setUserRole(user.id, next);
      setMessage(`Perfil de ${user.email} atualizado.`);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível alterar o perfil.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="users-panel">
      <section className="users-invite-panel" aria-labelledby="invite-title">
        <h2 id="invite-title">Convidar uma pessoa</h2>
        <p>Escolha quem terá acesso e o que essa pessoa poderá fazer.</p>
        <form
          method="post"
          onSubmit={(e) => void submit(e)}
          className="user-invite"
        >
          <label htmlFor="invite-email">E-mail (obrigatório)</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="nome@empresa.com.br"
            aria-describedby="invite-help"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <p id="invite-help" className="users-help">
            O convite para definir a senha será enviado por e-mail.
          </p>
          <fieldset disabled={busy}>
            <legend>Perfil de acesso</legend>
            <label className="access-option">
              <input
                type="radio"
                name="role"
                value="reader"
                checked={role === "reader"}
                onChange={() => setRole("reader")}
              />{" "}
              <span>
                <strong>Somente leitura</strong>
                <span>
                  Consulta a visão geral e os registros de ponto de todos os
                  contratos. Não altera os dados.
                </span>
              </span>
            </label>
            <label className="access-option">
              <input
                type="radio"
                name="role"
                value="admin"
                checked={role === "admin"}
                onChange={() => setRole("admin")}
              />{" "}
              <span>
                <strong>Administrador</strong>
                <span>
                  Consulta os dados, importa e limpa a base, e gerencia
                  jornadas.
                </span>
              </span>
            </label>
          </fieldset>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Aguarde…" : "Enviar convite"}
          </button>
        </form>
      </section>

      <section className="users-directory" aria-labelledby="directory-title">
        <div className="users-directory-heading">
          <div>
            <h2 id="directory-title">Usuários da base</h2>
            <p>Consulte os acessos e ajuste os perfis da equipe.</p>
          </div>
          <button
            type="button"
            ref={refreshRef}
            disabled={busy || loading}
            onClick={() => {
              void reload().catch(() =>
                setError("Não foi possível atualizar a lista."),
              );
            }}
          >
            Atualizar lista
          </button>
        </div>
        {loading ? (
          <p role="status">Carregando usuários…</p>
        ) : users.length === 0 ? (
          <p className="users-empty">
            Nenhum usuário listado. Envie um convite para adicionar uma pessoa.
          </p>
        ) : (
          <ul className="user-list">
            {users.map((user) => (
              <li key={user.id}>
                <div className="user-identity">
                  <span className="user-avatar" aria-hidden="true">
                    {user.email.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{user.email}</strong>
                    <span className="user-caption">
                      {user.canManageUsers
                        ? "Responsável pela gestão de usuários"
                        : user.role
                          ? "Acesso à base compartilhada"
                          : "Sem acesso ao sistema"}
                    </span>
                  </div>
                </div>
                {user.canManageUsers ? (
                  <span className="user-owner-role">Administrador</span>
                ) : (
                  <div className="user-access-actions">
                    <label>
                      <span className="user-caption">Perfil de acesso</span>
                      <select
                        aria-label={`Perfil de ${user.email}`}
                        value={user.role ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void changeRole(
                            user,
                            e.target.value as Access["role"],
                          )
                        }
                      >
                        {!user.role && (
                          <option value="" disabled>
                            Sem acesso
                          </option>
                        )}
                        <option value="reader">Somente leitura</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    {
                      <button
                        type="button"
                        className="user-revoke"
                        aria-label={`Excluir usuário ${user.email}`}
                        disabled={busy || loading}
                        onClick={() => {
                          setPendingRevoke(user);
                        }}
                      >
                        Excluir usuário
                      </button>
                    }
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <dialog
        ref={dialogRef}
        className="schedule-confirm user-revoke-dialog"
        aria-labelledby="revoke-title"
        aria-describedby="revoke-description"
        onClose={() => setPendingRevoke(null)}
        onCancel={(event) => {
          if (revoking.current) event.preventDefault();
        }}
      >
        <h2 id="revoke-title">Excluir usuário permanentemente?</h2>
        <p id="revoke-description">
          A conta de <strong>{pendingRevoke?.email}</strong> será excluída. Os
          registros de ponto e o histórico serão mantidos. Esta ação não pode
          ser desfeita.
        </p>

        {busy && <p role="status">Excluindo conta. Aguarde a conclusão.</p>}
        <div className="schedule-confirm-actions">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="schedule-confirm-delete"
            disabled={busy}
            onClick={() => void revoke()}
          >
            Excluir permanentemente
          </button>
        </div>
      </dialog>
    </div>
  );
}
