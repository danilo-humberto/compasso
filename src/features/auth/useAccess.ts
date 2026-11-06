import { useEffect, useState } from "react";
import { loadAccess, type Access } from "./access";
export function useAccess() {
  const [state, setState] = useState<{
    access: Access | null;
    loading: boolean;
    error: string;
  }>({ access: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const refresh = () => {
      const request = ++latestRequest;
      void loadAccess().then(
        (access) => {
          if (active && request === latestRequest)
            setState({ access, loading: false, error: "" });
        },
        (error: unknown) => {
          if (active && request === latestRequest)
            setState({
              access: null,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Não foi possível verificar suas permissões.",
            });
        },
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
