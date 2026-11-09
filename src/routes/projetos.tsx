import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FolderKanban, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState } from "@/components/ops/record-panels";
import { ProgressBar, taskProgress } from "@/components/ops/linked-lists";
import { ProjectDialog } from "@/components/ops/project-dialog";
import { fmtDate, isOverdue, PROJECT_STATUSES, useCampaigns, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/projetos")({
  head: () => ({ meta: [{ title: "Projetos — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="projetos">
      <ProjectsPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const MINE = "__mine__";

function ProjectsPage() {
  const { profile } = usePermissions();
  const { data: projects = [], isLoading } = useProjects();
  const { data: tasks = [] } = useTasks();
  const { data: campaigns = [] } = useCampaigns();
  const { data: profiles } = useProfiles();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [who, setWho] = useState(ALL);
  const [creating, setCreating] = useState(false);

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (status === ALL || p.status === status) &&
        (who === ALL || (who === MINE && (p.owner_id === profile?.id || p.team_ids.includes(profile?.id ?? "")))) &&
        (!term || p.name.toLowerCase().includes(term) || p.requester_area.toLowerCase().includes(term)),
    );
  }, [projects, q, status, who, profile?.id]);

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Projetos da equipe com responsável, equipe, prazo e andamento calculado pelas tarefas."
        actions={
          <Can module="projetos" action="create">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Novo projeto
            </Button>
          </Can>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou área" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os projetos</SelectItem>
            <SelectItem value={MINE}>Meus projetos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nenhum projeto ainda" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[100px]">Prioridade</TableHead>
                <TableHead className="w-[170px]">Responsável</TableHead>
                <TableHead className="w-[110px]">Prazo</TableHead>
                <TableHead className="w-[160px]">Andamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum projeto com esses filtros.</TableCell></TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to="/projetos/$id" params={{ id: p.id }} className="font-medium hover:text-primary-ink">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[campaignName(p.campaign_id), p.requester_area].filter(Boolean).join(" · ") || "Sem campanha"}
                    </div>
                  </TableCell>
                  <TableCell><Pill value={p.status} /></TableCell>
                  <TableCell><Pill value={p.priority} /></TableCell>
                  <TableCell className="text-sm">{p.owner_id ? profileName(profiles, p.owner_id) : "—"}</TableCell>
                  <TableCell className={`text-sm ${isOverdue(p.due_date, p.status === "Concluído") ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                    {fmtDate(p.due_date)}
                  </TableCell>
                  <TableCell>
                    <ProgressBar value={taskProgress(tasks.filter((t) => t.project_id === p.id))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
