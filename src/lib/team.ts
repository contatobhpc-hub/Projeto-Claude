// Dados compartilhados da equipe: perfis, cargos e matriz de permissões.
// Tudo vem direto do banco; não há cópia no navegador.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ModuleRow, ProfileRow, RolePermissionRow, RoleRow } from "@/integrations/supabase/types";

export const teamKeys = {
  profiles: ["team", "profiles"] as const,
  roles: ["team", "roles"] as const,
  modules: ["team", "modules"] as const,
  rolePermissions: ["team", "role_permissions"] as const,
};

export function useProfiles() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("team-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void qc.invalidateQueries({ queryKey: teamKeys.profiles });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: teamKeys.profiles,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: teamKeys.roles,
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useModules() {
  return useQuery({
    queryKey: teamKeys.modules,
    queryFn: async () => {
      const { data, error } = await supabase.from("modules").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as ModuleRow[];
    },
    staleTime: Infinity,
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: teamKeys.rolePermissions,
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return (data ?? []) as RolePermissionRow[];
    },
  });
}

/** Nome para exibir de um usuário a partir do id (para histórico, autoria etc.). */
export function profileName(profiles: ProfileRow[] | undefined, id: string | null | undefined) {
  if (!id) return "Sistema";
  const p = profiles?.find((x) => x.id === id);
  return p ? p.full_name || p.email : "Usuário removido";
}
