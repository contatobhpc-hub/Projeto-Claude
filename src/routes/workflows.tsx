import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell, CheckSquare, ListChecks, Plus, Trash2, Workflow as WorkflowIcon, Zap } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EnumSelect, Field, Pill } from "@/components/ops/fields";
import { EmptyState, Panel } from "@/components/ops/record-panels";
import { EntityDialog } from "@/components/ops/entity-dialog";
import { persist } from "@/components/ops/rel-dialogs";
import type { WorkflowAction, WorkflowRuleRow } from "@/integrations/supabase/types";
import { updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { WORKFLOW_TRIGGERS, useWorkflowRules, useWorkflowRuns } from "@/lib/inteligencia";
import { profileName, useProfiles, useRoles } from "@/lib/team";

export const Route = createFileRoute("/workflows")({
  head: () => ({ meta: [{ title: "Workflows — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="workflows">
      <WorkflowsPage />
    </ModuleGuard>
  ),
});

const triggerLabel = (id: string) => WORKFLOW_TRIGGERS.find((t) => t.id === id)?.label ?? id;

type Template = { name: string; description: string; trigger: string; condition_field?: string; condition_value?: string; actions: WorkflowAction[] };
const TEMPLATES: Template[] = [
  {
    name: "Kit de nova campanha",
    description: "Ao criar uma campanha, abre a tarefa de briefing para o responsável e o checklist padrão.",
    trigger: "campaign_created",
    actions: [
      { type: "create_task", title: "Briefing de {nome}", assignee_id: "owner", due_in_days: 3, priority: "Alta" },
      { type: "add_checklist", items: ["Briefing aprovado", "Peças criadas", "Mídia definida", "Orçamento aprovado", "Relatório final"] },
    ],
  },
  {
    name: "Checklist de evento",
    description: "Ao criar um evento, adiciona os itens essenciais de produção.",
    trigger: "event_created",
    actions: [{ type: "add_checklist", items: ["Local confirmado", "Convites enviados", "Coffee contratado", "Brindes separados", "Fotógrafo", "Post de divulgação"] }],
  },
  {
    name: "Compra aprovada avisa o Gestor",
    description: "Quando uma compra é aprovada, os Gestores são avisados para efetuar a compra.",
    trigger: "purchase_approved",
    actions: [{ type: "notify", target: "role:gestor", message: "Compra aprovada para efetuar: {nome}" }],
  },
  {
    name: "Conteúdo aprovado vira tarefa de publicação",
    description: "Ao aprovar um conteúdo, cria a tarefa de publicar.",
    trigger: "content_approved",
    actions: [{ type: "create_task", title: "Publicar: {nome}", assignee_id: "owner", due_in_days: 2, priority: "Média" }],
  },
];

function WorkflowsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: rules = [], isLoading } = useWorkflowRules();
  const { data: runs = [] } = useWorkflowRuns();
  const [open, setOpen] = useState<WorkflowRuleRow | Template | "new" | null>(null);

  async function toggle(r: WorkflowRuleRow, active: boolean) {
    try {
      await updateRow("workflow_rules", r.id, { active });
      void qc.invalidateQueries({ queryKey: ["workflow_rules"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Automações que rodam no servidor: quando algo acontece (gatilho), o sistema cria tarefas, avisa pessoas ou monta checklists."
        actions={
          <Can module="workflows" action="create">
            <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Nova automação</Button>
          </Can>
        }
      />

      {can("workflows", "create") && (
        <Panel title="Modelos prontos" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button key={t.name} type="button" onClick={() => setOpen(t)} className="rounded-xl border border-border p-3 text-left transition hover:border-primary/40">
                <div className="flex items-center gap-2 text-sm font-medium"><Zap className="h-4 w-4 text-primary-ink" /> {t.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {!isLoading && rules.length === 0 ? (
        <EmptyState icon={WorkflowIcon} title="Nenhuma automação ativa" desc="Comece por um dos modelos acima." />
      ) : (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automação</TableHead>
                <TableHead className="w-[220px]">Quando</TableHead>
                <TableHead className="w-[220px]">Faz</TableHead>
                <TableHead className="w-[120px]">Execuções</TableHead>
                <TableHead className="w-[80px]">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const mine = runs.filter((x) => x.rule_id === r.id);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {triggerLabel(r.trigger)}
                      {r.condition_field && <div className="text-xs text-muted-foreground">se {r.condition_field} = “{r.condition_value}”</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.actions.map((a) => (a.type === "create_task" ? "cria tarefa" : a.type === "notify" ? "avisa" : "adiciona checklist")).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {mine.length}
                      {mine.some((x) => x.status === "erro") && <span className="ml-1 text-xs text-red-600 dark:text-red-400">({mine.filter((x) => x.status === "erro").length} com erro)</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch checked={r.active} disabled={!can("workflows", "edit")} onCheckedChange={(v) => void toggle(r, v)} aria-label={`Ativar ${r.name}`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Panel title="Últimas execuções">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.slice(0, 30).map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
                <Pill value={x.status === "ok" ? "Concluído" : "Atrasado"} />
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-medium">{rules.find((r) => r.id === x.rule_id)?.name ?? "Regra removida"}</strong>
                  <span className="text-muted-foreground"> · {x.log}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(x.created_at), "dd/MM HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RuleDialog state={open} onClose={() => setOpen(null)} />
    </>
  );
}

const NONE = "__none__";

function RuleDialog({ state, onClose }: { state: WorkflowRuleRow | Template | "new" | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: profiles = [] } = useProfiles();
  const { data: roles = [] } = useRoles();
  const existing = state && state !== "new" && "id" in state ? state : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("campaign_created");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [busy, setBusy] = useState(false);
  const readOnly = existing ? !can("workflows", "edit") : !can("workflows", "create");

  useEffect(() => {
    if (!state) return;
    const src = state === "new" ? null : state;
    setName(src?.name ?? "");
    setDescription(src?.description ?? "");
    setTrigger(src?.trigger ?? "campaign_created");
    setField(src?.condition_field ?? "");
    setValue(src?.condition_value ?? "");
    setActions(src ? JSON.parse(JSON.stringify(src.actions)) : []);
  }, [state]);

  const trig = WORKFLOW_TRIGGERS.find((t) => t.id === trigger);
  const setAction = (i: number, a: WorkflowAction) => setActions(actions.map((x, j) => (j === i ? a : x)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (actions.length === 0) return void toast.error("Adicione pelo menos uma ação.");
    setBusy(true);
    try {
      await persist("workflow_rules", existing, {
        name: name.trim(), description, trigger, condition_field: field, condition_value: field ? value.trim() : "",
        actions: actions.map((a) => (a.type === "add_checklist" ? { ...a, items: a.items.map((x) => x.trim()).filter(Boolean) } : a)),
      });
      toast.success(existing ? "Automação salva." : "Automação criada e ativa.");
      void qc.invalidateQueries({ queryKey: ["workflow_rules"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? existing.name : "Nova automação"}
      description="Use {nome} nos textos para incluir o nome do item que disparou a automação."
      formId="wf-form"
      isNew={!existing}
      readOnly={readOnly}
      busy={busy}
      wide
      remove={existing && can("workflows", "delete") ? { table: "workflow_rules", id: existing.id, label: existing.name } : undefined}
      form={
        <form id="wf-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} required disabled={readOnly} /></Field>
            <Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Quando (gatilho)">
              <Select value={trigger} onValueChange={(v) => { setTrigger(v); setField(""); }} disabled={readOnly}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{WORKFLOW_TRIGGERS.map((t) => <SelectItem key={t.id} value={t.id}>{t.module}: {t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Só se (opcional)">
                <Select value={field || NONE} onValueChange={(v) => setField(v === NONE ? "" : v)} disabled={readOnly}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sempre</SelectItem>
                    {trig?.fields.map((f) => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="for igual a"><Input value={value} onChange={(e) => setValue(e.target.value)} disabled={readOnly || !field} placeholder="ex.: Em andamento" /></Field>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Então</div>
            <div className="space-y-3">
              {actions.map((a, i) => (
                <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      {a.type === "create_task" ? <CheckSquare className="h-4 w-4" /> : a.type === "notify" ? <Bell className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                      {a.type === "create_task" ? "Criar tarefa" : a.type === "notify" ? "Enviar notificação" : "Adicionar checklist"}
                    </span>
                    {!readOnly && (
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover ação" onClick={() => setActions(actions.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {a.type === "create_task" && (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Field label="Título" className="sm:col-span-2"><Input value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} disabled={readOnly} /></Field>
                      <Field label="Responsável">
                        <Select value={a.assignee_id || NONE} onValueChange={(v) => setAction(i, { ...a, assignee_id: v === NONE ? undefined : v })} disabled={readOnly}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ninguém</SelectItem>
                            <SelectItem value="owner">Responsável do item</SelectItem>
                            {profiles.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Prazo (dias)"><Input type="number" min={0} value={a.due_in_days ?? ""} onChange={(e) => setAction(i, { ...a, due_in_days: e.target.value === "" ? undefined : Number(e.target.value) })} disabled={readOnly} /></Field>
                      <Field label="Prioridade"><EnumSelect value={a.priority ?? "Média"} options={PRIORITIES} onChange={(v) => setAction(i, { ...a, priority: v })} disabled={readOnly} /></Field>
                    </div>
                  )}
                  {a.type === "notify" && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Para quem">
                        <Select value={a.target} onValueChange={(v) => setAction(i, { ...a, target: v })} disabled={readOnly}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Responsável do item</SelectItem>
                            {roles.map((r) => <SelectItem key={r.id} value={`role:${r.key}`}>Cargo: {r.name}</SelectItem>)}
                            {profiles.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={`user:${p.id}`}>{profileName(profiles, p.id)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Mensagem" className="sm:col-span-2"><Input value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} disabled={readOnly} /></Field>
                    </div>
                  )}
                  {a.type === "add_checklist" && (
                    <Field label="Itens (um por linha)">
                      <Textarea
                        rows={4}
                        value={a.items.join("\n")}
                        onChange={(e) => setAction(i, { ...a, items: e.target.value.split("\n") })}
                        onBlur={() => setAction(i, { ...a, items: a.items.map((x) => x.trim()).filter(Boolean) })}
                        disabled={readOnly}
                      />
                    </Field>
                  )}
                </div>
              ))}
            </div>
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setActions([...actions, { type: "create_task", title: "Tarefa de {nome}", assignee_id: "owner", due_in_days: 3, priority: "Média" }])}>
                  <CheckSquare className="h-4 w-4" /> Criar tarefa
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setActions([...actions, { type: "notify", target: "owner", message: "{nome}" }])}>
                  <Bell className="h-4 w-4" /> Notificar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setActions([...actions, { type: "add_checklist", items: [] }])}>
                  <ListChecks className="h-4 w-4" /> Checklist
                </Button>
              </div>
            )}
          </div>
        </form>
      }
    />
  );
}
