import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, passwordRequested } from "../../data/client";
const Context = createContext<{
  session: Session | null;
  loading: boolean;
  recovery: boolean;
}>({ session: null, loading: true, recovery: false });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(passwordRequested);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT" || event === "USER_UPDATED")
        setRecovery(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Context.Provider value={{ session, loading, recovery }}>
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
export async function signOut() {
  const { error } = await supabase!.auth.signOut();
  if (error) throw error;
}
