import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let initialResolved = false;

    const finishInitialLoad = (s?: Session | null) => {
      if (!active || initialResolved) return;
      initialResolved = true;
      if (s !== undefined) setSession(s);
      setLoading(false);
    };

    let unsub = () => {};
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
        if (!active) return;
        setSession(s);
        if (s) finishInitialLoad(s);
      });
      unsub = () => sub.subscription.unsubscribe();
      supabase.auth
        .getSession()
        .then(({ data }) => finishInitialLoad(data.session))
        .catch((e) => {
          console.error("[auth] getSession failed", e);
          finishInitialLoad(null);
        });
    } catch (e) {
      console.error("[auth] init failed", e);
      finishInitialLoad(null);
    }

    // Safety net: never leave the UI stuck on the loading screen.
    const safety = setTimeout(() => finishInitialLoad(null), 4000);

    return () => {
      active = false;
      clearTimeout(safety);
      unsub();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
