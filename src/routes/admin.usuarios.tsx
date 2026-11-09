import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileRow } from "@/integrations/supabase/types";
import { usePermissions } from "@/lib/permissions";
import { teamKeys, useProfiles, useRoles } from "@/lib/team";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <UsersPage />
    </ModuleGuard>
  ),
});

type Filter = "pendentes" | "ativos" | "inativos" | "todos";

function UsersPage() {
  const qc = useQueryClient();
  const { profile: me } = usePermissions();
  const { data: profiles = [], isLoading } = useProfiles();
  const { data: roles = [] } = useRoles();
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");

  // "Pendente" = inativo e ainda com o cargo padrão de cadastro (Colaborador).
  // Inativo com outro cargo = alguém que já teve acesso e foi desativado.
  const colaboradorId = roles.find((r) => r.key === "colaborador")?.id;
  const isPending = (p: ProfileRow) => !p.active && p.role_id === colaboradorId;

  const counts = useMemo(
    () => ({
      pendentes: profiles.filter(isPending).length,
      ativos: profiles.filter((p) => p.active).length,
      inativos: profiles.filter((p) => !p.active && !isPending(p)).length,
      todos: profiles.length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, colaboradorId],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return profiles
      .filter((p) => {
        if (filter === "pendentes") return isPending(p);
        if (filter === "ativos") return p.active;
        if (filter === "inativos") return !p.active && !isPending(p);
        return true;
      })
      .filter((p) => !term || p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, filter, q, colaboradorId]);

  async function update(p: ProfileRow, patch: Partial<Pick<ProfileRow, "role_id" | "active">>, okMsg: string) {
    // Atualização otimista; se o banco recusar, desfaz.
    const prev = qc.getQueryData<ProfileRow[]>(teamKeys.profiles);
    qc.setQueryData<ProfileRow[]>(teamKeys.profiles, (old) => old?.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
    if (error) {
      qc.setQueryData(teamKeys.profiles, prev);
      toast.error(errorMessage(error));
      return;
    }
    toast.success(okMsg);
    void qc.invalidateQueries({ queryKey: teamKeys.profiles });
  }

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Libere novos cadastros, defina o cargo de cada pessoa e desative quem saiu da equipe. Ninguém altera o próprio cargo."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes ({counts.pendentes})</TabsTrigger>
            <TabsTrigger value="ativos">Ativos ({counts.ativos})</TabsTrigger>
            <TabsTrigger value="inativos">Inativos ({counts.inativos})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead className="w-[220px]">Cargo</TableHead>
              <TableHead className="w-[140px]">Acesso</TableHead>
              <TableHead className="w-[130px]">Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum usuário neste filtro.</TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const self = p.id === me?.id;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">
                      {p.full_name || "Sem nome"}
                      {self && <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.email}
                      {p.job_title ? ` · ${p.job_title}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={p.role_id ?? undefined}
                      disabled={self}
                      onValueChange={(v) => {
                        const r = roles.find((x) => x.id === v);
                        void update(p, { role_id: v }, `${p.full_name || p.email} agora é ${r?.name ?? "outro cargo"}.`);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.active}
                        disabled={self}
                        aria-label={p.active ? "Desativar acesso" : "Liberar acesso"}
                        onCheckedChange={(v) =>
                          void update(p, { active: v }, v ? `Acesso liberado para ${p.full_name || p.email}.` : `Acesso de ${p.full_name || p.email} desativado.`)
                        }
                      />
                      {p.active ? (
                        <Badge variant="secondary">Ativo</Badge>
                      ) : isPending(p) ? (
                        <Badge>Pendente</Badge>
                      ) : (
                        <Badge variant="outline">Inativo</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Novos cadastros entram como Colaborador, sem acesso, até serem liberados aqui. Para restringir o cadastro a e-mails da
        organização, use Configurações.
      </p>
    </>
  );
}
