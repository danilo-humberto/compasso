import { createPortal } from "react-dom";
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

export type ToastAction = "added" | "updated" | "deleted" | "error" | "info";
export interface ToastMessage {
  action: ToastAction;
  message: string;
  title?: string;
  /** Milliseconds; zero keeps the notification until dismissed. */
  duration?: number;
}
interface Notification extends ToastMessage {
  id: string;
}
const variants = {
  error: { title: "Não foi possível concluir", icon: "!" },
  info: { title: "Informação", icon: "i" },
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
      <ToastViewport>
        {notifications.slice(0, 3).map((notification) => (
          <Toast
            key={notification.id}
            notification={notification}
            remove={remove}
          />
        ))}
      </ToastViewport>
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
  const duration =
    notification.duration ?? (notification.action === "error" ? 0 : 6000);
  const remaining = useRef(duration);
  const { id, action, message } = notification;
  const title = notification.title ?? variants[action].title;
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || leaving || duration === 0) return;
    const started = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [paused, leaving, duration]);
  useEffect(() => {
    if (!leaving) return;
    // Fallback para animações desabilitadas ou eventos não disparados pelo navegador.
    const timer = window.setTimeout(() => remove(id), 250);
    return () => window.clearTimeout(timer);
  }, [leaving, id, remove]);

  return (
    <article
      className={`toast toast--${action}`}
      role={action === "error" ? "alert" : "status"}
      aria-live={action === "error" ? "assertive" : "polite"}
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

// Keep notifications reachable while a native modal makes the rest of the page inert.
function ToastViewport({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element>(document.body);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () =>
      setTarget(document.querySelector("dialog[open]") ?? document.body);
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (
      target === document.body &&
      element &&
      "popover" in HTMLElement.prototype &&
      !element.matches(":popover-open")
    )
      element.showPopover();
  }, [target, children]);
  return createPortal(
    <section
      ref={ref}
      popover={target === document.body ? "manual" : undefined}
      className="toast-stack"
      aria-label="Notificações do sistema"
    >
      {children}
    </section>,
    target,
  );
}

export function useToastMessage(action: ToastAction, title?: string) {
  const { notify } = useToast();
  return useCallback(
    (message: string) => notify({ action, title, message }),
    [notify, action, title],
  );
}
