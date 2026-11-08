// Permissões do usuário logado.
// A fonte de verdade é o banco (função my_permissions + políticas RLS).
// Aqui só lemos o resultado para mostrar/esconder menus e botões; mesmo que
// alguém burle a tela, o banco recusa a operação.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { channelName } from "@/lib/data";
import type { MyPermissionRow, ProfileRow, RoleRow } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

export type Action = "view" | "create" | "edit" | "delete" | "approve";

export type ModuleKey =
  | "dashboard"
  | "prioridades"
  | "notificacoes"
  | "planejamento"
  | "indicadores"
  | "campanhas"
  | "projetos"
  | "kanban"
  | "calendario"
  | "conteudos"
  | "parceiros"
  | "contratos"
  | "eventos"
  | "patrocinios"
  | "midia"
  | "brindes"
  | "ia"
  | "analytics"
  | "fin_orcamento"
  | "fin_compras"
  | "workflows"
  | "admin";

export type MyProfile = ProfileRow & { role: Pick<RoleRow, "id" | "key" | "name"> | null };

type PermissionsCtx = {
  loading: boolean;
  profile: MyProfile | null;
  isAdmin: boolean;
  /** Permissão sobre todos os registros do módulo. */
  can: (module: ModuleKey, action: Action) => boolean;
  /** Permissão só sobre registros atribuídos ao usuário (escopo "own"). */
  canOwn: (module: ModuleKey, action: "edit" | "delete") => boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<PermissionsCtx>({
  loading: true,
  profile: null,
  isAdmin: false,
  can: () => false,
  canOwn: () => false,
  refresh: async () => {},
});

export const permissionsKeys = {
  all: ["permissions"] as const,
  mine: (uid: string | undefined) => ["permissions", "mine", uid] as const,
  profile: (uid: string | undefined) => ["permissions", "profile", uid] as const,
};

async function fetchMyProfile(uid: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, role:roles(id, key, name)")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as MyProfile) ?? null;
}

async function fetchMyPermissions(): Promise<MyPermissionRow[]> {
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) throw error;
  return (data ?? []) as MyPermissionRow[];
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: permissionsKeys.profile(uid),
    queryFn: () => fetchMyProfile(uid!),
    enabled: !!uid,
    staleTime: 60_000,
  });

  const permsQ = useQuery({
    queryKey: permissionsKeys.mine(uid),
    queryFn: fetchMyPermissions,
    enabled: !!uid,
    staleTime: 60_000,
  });

  // Quando o Administrador muda o cargo da pessoa ou a matriz, a tela se ajusta sozinha.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(channelName(`permissions-${uid}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, () => {
        void qc.invalidateQueries({ queryKey: permissionsKeys.all });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, () => {
        void qc.invalidateQueries({ queryKey: permissionsKeys.all });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, qc]);

  const value = useMemo<PermissionsCtx>(() => {
    const profile = profileQ.data ?? null;
    const byModule = new Map((permsQ.data ?? []).map((p) => [p.module, p]));
    const isAdmin = !!profile?.active && profile.role?.key === "admin";

    const can = (module: ModuleKey, action: Action) => {
      if (!profile?.active) return false;
      if (isAdmin) return true;
      const p = byModule.get(module);
      if (!p) return false;
      switch (action) {
        case "view":
          return p.can_view;
        case "create":
          return p.can_create;
        case "edit":
          return p.can_edit && p.scope === "all";
        case "delete":
          return p.can_delete && p.scope === "all";
        case "approve":
          return p.can_approve;
      }
    };

    const canOwn = (module: ModuleKey, action: "edit" | "delete") => {
      if (can(module, action)) return true;
      const p = byModule.get(module);
      if (!p || p.scope !== "own" || !profile?.active) return false;
      return action === "edit" ? p.can_edit : p.can_delete;
    };

    return {
      loading: !!uid && (profileQ.isLoading || permsQ.isLoading),
      profile,
      isAdmin,
      can,
      canOwn,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: permissionsKeys.all });
      },
    };
  }, [uid, profileQ.data, profileQ.isLoading, permsQ.data, permsQ.isLoading, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePermissions() {
  return useContext(Ctx);
}

export function useCan(module: ModuleKey, action: Action) {
  return useContext(Ctx).can(module, action);
}
