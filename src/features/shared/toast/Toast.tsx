import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./toast.css";

export type ToastAction = "added" | "updated" | "deleted";
export interface ToastMessage {
  action: ToastAction;
  message: string;
  title?: string;
}
interface Notification extends ToastMessage {
  id: string;
}
const variants = {
  added: { title: "Dados adicionados", icon: "+" },
  updated: { title: "Dados atualizados", icon: "✓" },
  deleted: { title: "Dados excluídos", icon: "−" },
} satisfies Record<ToastAction, { title: string; icon: string }>;
const ToastContext = createContext<{
  notify: (message: ToastMessage) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notify = useCallback((message: ToastMessage) => {
    setNotifications((current) => [
      ...current,
      { ...message, id: crypto.randomUUID() },
    ]);
  }, []);
  const remove = useCallback(
    (id: string) =>
      setNotifications((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <section className="toast-stack" aria-label="Notificações do sistema">
        {notifications.slice(0, 3).map((notification) => (
          <Toast
            key={notification.id}
            notification={notification}
            remove={remove}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context)
    throw new Error("useToast precisa estar dentro de ToastProvider.");
  return context;
}

function Toast({
  notification,
  remove,
}: {
  notification: Notification;
  remove: (id: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(6000);
  const { id, action, message } = notification;
  const title = notification.title ?? variants[action].title;
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || leaving) return;
    const started = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [paused, leaving]);
  useEffect(() => {
    if (!leaving) return;
    // Fallback para animações desabilitadas ou eventos não disparados pelo navegador.
    const timer = window.setTimeout(() => remove(id), 250);
    return () => window.clearTimeout(timer);
  }, [leaving, id, remove]);

  return (
    <article
      className={`toast toast--${action}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-state={leaving ? "leaving" : "visible"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) remove(id);
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        {variants[action].icon}
      </span>
      <div className="toast-content">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label={`Fechar notificação: ${title}`}
        onClick={() => setLeaving(true)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </article>
  );
}
