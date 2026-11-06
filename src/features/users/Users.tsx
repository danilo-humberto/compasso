import { useEffect, useState, type FormEvent } from "react";
import {
  inviteUser,
  listUsers,
  setUserRole,
  type Access,
  type AppUser,
} from "../auth/access";
export function Users() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Access["role"]>("reader");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await inviteUser(email.trim(), role);
      setEmail("");
      setMessage(
        "Convite enviado. A pessoa receberá um e-mail para definir sua senha.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível enviar o convite.",
      );
    }
    try {
      await reload();
    } catch {
      setError(
        (old) => old || "Não foi possível atualizar a lista de usuários.",
      );
    }
    setBusy(false);
  }
  async function changeRole(user: AppUser, next: Access["role"]) {
    setBusy(true);
    setError("");
    setMessage("");
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
    <section className="panel users-panel">
      <h2>Gerenciar usuários</h2>
      <p>
        Convide pessoas para a base compartilhada. Somente leitura permite
        consultar todos os contratos, sem alterar os dados.
      </p>
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
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <fieldset disabled={busy}>
          <legend>Perfil de acesso</legend>
          <label>
            <input
              type="radio"
              name="role"
              value="reader"
              checked={role === "reader"}
              onChange={() => setRole("reader")}
            />{" "}
            Somente leitura — visão geral e registros de ponto
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="admin"
              checked={role === "admin"}
              onChange={() => setRole("admin")}
            />{" "}
            Administrador — consultas, importação, limpeza da base e jornadas
          </label>
        </fieldset>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Aguarde…" : "Enviar convite"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <h2>Usuários da base</h2>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          setError("");
          void reload().catch(() =>
            setError("Não foi possível atualizar a lista."),
          );
        }}
      >
        Atualizar lista
      </button>
      {loading ? (
        <p role="status">Carregando usuários…</p>
      ) : (
        <ul className="user-list">
          {users.map((user) => (
            <li key={user.id}>
              <strong>{user.email}</strong>
              {user.canManageUsers ? (
                <span>Administrador · responsável pelos usuários</span>
              ) : (
                <label>
                  Perfil de {user.email}
                  <select
                    aria-label={`Perfil de ${user.email}`}
                    value={user.role ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      void changeRole(user, e.target.value as Access["role"])
                    }
                  >
                    {!user.role && (
                      <option value="" disabled>
                        Acesso pendente
                      </option>
                    )}
                    <option value="reader">Somente leitura</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
