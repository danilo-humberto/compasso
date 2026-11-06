import { useToastMessage } from "../features/shared/toast/Toast";
import { useEffect, useMemo, useState } from "react";
import { repository } from "../data/repository";
import { useSession, signOut } from "../features/auth/Session";
import { Login } from "../features/auth/Login";
import { useSnapshot } from "../features/shared/useSnapshot";
import { Filters, type FilterValues } from "../features/shared/Filters";
import { report } from "../domain/time";
import { Dashboard } from "../features/dashboard/Dashboard";
import { Records } from "../features/records/Records";
import { Imports } from "../features/imports/Imports";
import { Schedules } from "../features/schedules/Schedules";
import { Brand } from "../features/shared/Brand";
import { useAccess } from "../features/auth/useAccess";
import type { Access } from "../features/auth/access";
import { Users } from "../features/users/Users";
type Page = "dashboard" | "records" | "schedules" | "imports" | "users";
const pages: { id: Page; label: string; icon: string; description: string }[] =
  [
    {
      id: "dashboard",
      label: "Visão geral",
      icon: "▦",
      description: "Entenda as jornadas. Acompanhe sua equipe.",
    },
    {
      id: "records",
      label: "Registros de ponto",
      icon: "◷",
      description: "Cada colaborador, cada dia, cada batida.",
    },
    {
      id: "schedules",
      label: "Jornadas",
      icon: "▤",
      description: "Organize as horas previstas da sua operação.",
    },
    {
      id: "users",
      label: "Usuários",
      icon: "♙",
      description: "Gerencie os acessos à base compartilhada.",
    },
    {
      id: "imports",
      label: "Importar base",
      icon: "↥",
      description: "Mantenha os registros da sua equipe em dia.",
    },
  ];
export function App() {
  const { session, loading, recovery } = useSession();
  if (loading) return <div className="empty">Carregando sessão…</div>;
  if (recovery) return <Login recovery />;
  if (!session) return <Login />;
  return (
    <AuthorizedWorkspace
      key={session.user.id}
      email={session.user.email ?? ""}
    />
  );
}
function AuthorizedWorkspace({ email }: { email: string }) {
  const { access, loading, error, retry } = useAccess();
  const setLogoutError = useToastMessage("error");
  useEffect(() => {
    if (error) setLogoutError(error);
  }, [error, setLogoutError]);
  if (loading)
    return (
      <p role="status" className="empty">
        Verificando permissões…
      </p>
    );
  if (!access)
    return (
      <main className="empty">
        <p>Acesso indisponível. Tente novamente ou saia da conta.</p>

        <button onClick={retry}>Tentar novamente</button>
        <button
          onClick={() => void signOut().catch((e) => setLogoutError(String(e)))}
        >
          Sair
        </button>
      </main>
    );
  return (
    <Workspace
      key={`${access.role}:${access.canManageUsers}`}
      email={email}
      access={access}
    />
  );
}
function Workspace({ email, access }: { email: string; access: Access }) {
  const canEdit = access.role === "admin";
  const visiblePages = pages.filter((p) =>
    p.id === "users"
      ? access.canManageUsers
      : canEdit || p.id === "dashboard" || p.id === "records",
  );
  const repo = repository;
  const { snapshot, error, loading, reload } = useSnapshot(repo);
  const [page, setPage] = useState<Page>("dashboard"),
    [filters, setFilters] = useState<FilterValues>({
      month: "",
      contract: "",
      employee: "",
    });
  const setActionError = useToastMessage("error");
  useEffect(() => {
    if (error) setActionError(error);
  }, [error, setActionError]);
  function navigate(nextPage: Page) {
    if (!visiblePages.some((p) => p.id === nextPage)) return;
    if (nextPage === page) return;
    setPage(nextPage);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  const hasScheduleConflict = useMemo(() => {
    const targets = new Set<string>();
    return (
      snapshot?.schedules.some((s) => {
        const key = JSON.stringify([s.target, s.targetId]);
        if (targets.has(key)) return true;
        targets.add(key);
        return false;
      }) ?? false
    );
  }, [snapshot]);
  const allRows = useMemo(
    () =>
      snapshot && !hasScheduleConflict
        ? report(snapshot.records, snapshot.schedules)
        : [],
    [snapshot, hasScheduleConflict],
  );
  const rows = useMemo(
    () =>
      allRows.filter(
        ({ record: r }) =>
          (!filters.month || r.date.startsWith(filters.month)) &&
          (!filters.contract || r.contract === filters.contract) &&
          (!filters.employee || r.employeeId === filters.employee),
      ),
    [allRows, filters],
  );
  const current = pages.find((p) => p.id === page)!;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <small className="nav-heading">ESPAÇO DE TRABALHO</small>
        <nav>
          {visiblePages.map((p) => (
            <button
              className={p.id === page ? "active" : ""}
              key={p.id}
              onClick={() => navigate(p.id)}
            >
              <span aria-hidden="true">{p.icon}</span>
              {p.label}
              {p.id === "imports" && <b aria-hidden="true">+</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>Uma operação mais clara.</span>
          <p>
            Os números do ponto,
            <br />
            com o contexto que importa.
          </p>
        </div>
        <div className="profile">
          <div className="avatar">{email.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{email.split("@")[0]}</strong>
            <small>
              {access.canManageUsers
                ? "Administrador · responsável"
                : canEdit
                  ? "Administrador"
                  : "Somente leitura"}
            </small>
          </div>
          <button
            aria-label="Sair"
            onClick={() => {
              void signOut().catch((e) => setActionError(String(e)));
            }}
          >
            ↪
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>{current.label}</strong>
          </span>
          <span className="connection">
            <i />
            Base compartilhada
            <button
              aria-label="Sair da sessão"
              onClick={() => {
                void signOut().catch((e) => setActionError(String(e)));
              }}
            >
              Sair
            </button>
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              {page !== "users" && (
                <span className="eyebrow">GESTÃO DE JORNADAS</span>
              )}
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>
            {canEdit && page !== "imports" && page !== "users" && (
              <button className="primary" onClick={() => navigate("imports")}>
                ↥ Importar base
              </button>
            )}
          </div>
          {error && (
            <div className="error">
              Não foi possível atualizar a base.
              <button onClick={() => void reload()}>Tentar novamente</button>
            </div>
          )}
          {page === "users" && access.canManageUsers ? (
            <Users />
          ) : loading && !snapshot ? (
            <p role="status" className="empty">
              Carregando sua base…
            </p>
          ) : (
            snapshot && (
              <>
                {hasScheduleConflict ? (
                  <>
                    <p className="error" role="alert">
                      Há mais de uma jornada para o mesmo destino. Mantenha
                      apenas uma por contrato ou colaborador. Os cálculos ficam
                      suspensos até resolver os conflitos.
                    </p>
                    {canEdit ? (
                      <Schedules
                        snapshot={snapshot}
                        repository={repo}
                        reload={reload}
                      />
                    ) : (
                      <p>Solicite a correção a um administrador.</p>
                    )}
                  </>
                ) : (
                  <>
                    {(page === "dashboard" || page === "records") && (
                      <Filters
                        records={snapshot.records}
                        value={filters}
                        onChange={setFilters}
                      />
                    )}{" "}
                    {page === "dashboard" && (
                      <Dashboard rows={rows} employee={filters.employee} />
                    )}{" "}
                    {page === "records" && <Records rows={rows} />}{" "}
                    {page === "imports" && canEdit && (
                      <Imports
                        snapshot={snapshot}
                        repository={repo}
                        reload={reload}
                        onReset={() =>
                          setFilters({ month: "", contract: "", employee: "" })
                        }
                      />
                    )}{" "}
                    {page === "schedules" && canEdit && (
                      <Schedules
                        snapshot={snapshot}
                        repository={repo}
                        reload={reload}
                      />
                    )}
                  </>
                )}
              </>
            )
          )}
          <footer className="app-footer">
            Compasso · Clareza para cada jornada.
            <span>Saldo informativo · não substitui a apuração da folha</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
