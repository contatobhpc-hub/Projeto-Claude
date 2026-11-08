import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnumSelect, Field, Pill, PersonSelect } from "@/components/ops/fields";
import { ApprovalPanel, EmptyState, Panel, RecordHistory } from "@/components/ops/record-panels";
import { EntityDialog } from "@/components/ops/entity-dialog";
import { persist } from "@/components/ops/rel-dialogs";
import type { KeyResultRow, ObjectiveRow } from "@/integrations/supabase/types";
import { deleteRow, moneyInput, orNull, parseMoney } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { fmtDate, useCampaigns } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import {
  COMMERCIAL_CALENDAR,
  krCurrent,
  krProgress,
  OBJECTIVE_PRESETS,
  OBJECTIVE_STATUSES,
  PERSPECTIVES,
  useIndicators,
  useIndicatorValues,
  useKeyResults,
  useObjectives,
} from "@/lib/inteligencia";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/planejamento")({
  head: () => ({ meta: [{ title: "Planejamento Estratégico — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="planejamento">
      <PlanningPage />
    </ModuleGuard>
  ),
});

const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function PlanningPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { can } = usePermissions();
  const { data: objectives = [], isLoading } = useObjectives(year);
  const { data: krs = [] } = useKeyResults();
  const { data: indicators = [] } = useIndicators();
  const { data: values = [] } = useIndicatorValues();
  const { data: campaigns = [] } = useCampaigns();
  const { data: profiles } = useProfiles();
  const [editing, setEditing] = useState<ObjectiveRow | "new" | null>(null);
  const [krFor, setKrFor] = useState<{ objective: ObjectiveRow; kr: KeyResultRow | null } | null>(null);

  const progressOf = (o: ObjectiveRow) => {
    const list = krs.filter((k) => k.objective_id === o.id);
    if (list.length === 0) return null;
    return Math.round(list.reduce((s, k) => s + krProgress(k, krCurrent(k, values, indicators, o.year)), 0) / list.length);
  };
  const overall = objectives.map(progressOf).filter((x): x is number => x !== null);

  return (
    <>
      <PageHeader
        title="Planejamento Estratégico"
        description="Objetivos do ano, resultados-chave medidos por indicadores e as campanhas que contribuem para cada um."
        actions={
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[thisYear + 1, thisYear, thisYear - 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Can module="planejamento" action="create">
              <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Novo objetivo</Button>
            </Can>
          </div>
        }
      />

      {objectives.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs text-muted-foreground">Progresso médio</div>
            <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{overall.length ? `${Math.round(overall.reduce((a, b) => a + b, 0) / overall.length)}%` : "—"}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs text-muted-foreground">Objetivos</div>
            <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{objectives.length}</div>
            <div className="text-xs text-muted-foreground">{objectives.filter((o) => o.approval_status === "Aprovada").length} aprovados</div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs text-muted-foreground">Campanhas ligadas</div>
            <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{campaigns.filter((c) => objectives.some((o) => o.id === c.objective_id)).length}</div>
          </div>
        </div>
      )}

      {!isLoading && objectives.length === 0 ? (
        <EmptyState icon={Target} title={`Nenhum objetivo para ${year}`} desc="Comece pelos 3 a 5 objetivos que o marketing vai perseguir no ano." />
      ) : (
        <div className="space-y-6">
          {PERSPECTIVES.map((persp) => {
            const list = objectives.filter((o) => o.perspective === persp);
            if (list.length === 0) return null;
            return (
              <section key={persp}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{persp}</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {list.map((o) => {
                    const pct = progressOf(o);
                    const okrs = krs.filter((k) => k.objective_id === o.id);
                    const linked = campaigns.filter((c) => c.objective_id === o.id);
                    return (
                      <Panel
                        key={o.id}
                        actions={
                          can("planejamento", "edit") && (
                            <Button size="icon" variant="ghost" aria-label="Editar objetivo" onClick={() => setEditing(o)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )
                        }
                        title={o.title}
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
                          <Pill value={o.status} />
                          <Pill value={o.approval_status} />
                          <span className="text-muted-foreground">{o.owner_id ? profileName(profiles, o.owner_id) : "Sem responsável"}</span>
                          <span className="ml-auto font-semibold tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
                        </div>
                        {o.description && <p className="mb-3 text-sm text-muted-foreground">{o.description}</p>}

                        <ul className="space-y-3">
                          {okrs.map((k) => {
                            const cur = krCurrent(k, values, indicators, o.year);
                            const p = krProgress(k, cur);
                            const ind = indicators.find((i) => i.id === k.indicator_id);
                            return (
                              <li key={k.id}>
                                <button
                                  type="button"
                                  disabled={!can("planejamento", "edit")}
                                  onClick={() => setKrFor({ objective: o, kr: k })}
                                  className="w-full text-left disabled:cursor-default"
                                >
                                  <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span>{k.title}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">
                                      {fmtNum(cur)} / {fmtNum(Number(k.target))} {k.unit}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div className={`h-full rounded-full ${p >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${p}%` }} />
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    {ind ? `Medido pelo indicador “${ind.name}”` : "Valor informado manualmente"}
                                    {k.due_date && ` · até ${fmtDate(k.due_date)}`}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {can("planejamento", "edit") && (
                          <Button size="sm" variant="outline" className="mt-3" onClick={() => setKrFor({ objective: o, kr: null })}>
                            <Plus className="h-4 w-4" /> Resultado-chave
                          </Button>
                        )}

                        {linked.length > 0 && (
                          <div className="mt-4 border-t border-border pt-3">
                            <div className="mb-1 text-xs text-muted-foreground">Campanhas que contribuem</div>
                            <div className="flex flex-wrap gap-1.5">
                              {linked.map((c) => (
                                <Link key={c.id} to="/campanhas/$id" params={{ id: c.id }} className="rounded-md border border-border px-2 py-0.5 text-xs hover:border-primary/40">
                                  {c.name}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </Panel>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Panel title={`Calendário comercial ${year}`} className="mt-8">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {COMMERCIAL_CALENDAR.map((theme, i) => {
            const month = String(i + 1).padStart(2, "0");
            const list = campaigns.filter((c) => c.start_date?.startsWith(`${year}-${month}`));
            return (
              <div key={month} className="rounded-xl border border-border p-3">
                <div className="text-xs text-muted-foreground capitalize">{new Date(year, i, 1).toLocaleDateString("pt-BR", { month: "long" })}</div>
                <div className="text-sm font-medium">{theme}</div>
                <div className="mt-1 space-y-0.5">
                  {list.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">Nenhuma campanha começa neste mês</div>
                  ) : (
                    list.map((c) => (
                      <Link key={c.id} to="/campanhas/$id" params={{ id: c.id }} className="block truncate text-[11px] text-primary hover:underline">
                        {c.name}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <ObjectiveDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} objective={editing && editing !== "new" ? objectives.find((x) => x.id === editing.id) ?? editing : null} year={year} />
      <KeyResultDialog state={krFor} onClose={() => setKrFor(null)} />
    </>
  );
}

function ObjectiveDialog({ open, onOpenChange, objective, year }: { open: boolean; onOpenChange: (o: boolean) => void; objective: ObjectiveRow | null; year: number }) {
  const qc = useQueryClient();
  const { can, profile } = usePermissions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [perspective, setPerspective] = useState<string>("Negócios");
  const [status, setStatus] = useState<string>("Planejado");
  const [owner, setOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !objective;
  const readOnly = isNew ? !can("planejamento", "create") : !can("planejamento", "edit");

  useEffect(() => {
    if (!open) return;
    setTitle(objective?.title ?? "");
    setDescription(objective?.description ?? "");
    setPerspective(objective?.perspective ?? "Negócios");
    setStatus(objective?.status ?? "Planejado");
    setOwner(objective ? objective.owner_id : profile?.id ?? null);
  }, [open, objective, profile?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await persist("strategic_objectives", objective, { year: objective?.year ?? year, title: title.trim(), description, perspective, status, owner_id: owner });
      toast.success(isNew ? "Objetivo criado." : "Objetivo salvo.");
      void qc.invalidateQueries({ queryKey: ["strategic_objectives"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? `Novo objetivo ${year}` : objective!.title}
      formId="objective-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      remove={objective && can("planejamento", "delete") ? { table: "strategic_objectives", id: objective.id, label: objective.title } : undefined}
      tabs={
        objective
          ? [
              { value: "aprovacao", label: "Aprovação", content: <ApprovalPanel table="strategic_objectives" module="planejamento" record={objective} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="strategic_objectives" recordId={objective.id} /> },
            ]
          : []
      }
      form={
        <form id="objective-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Objetivo" className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required disabled={readOnly} list="objective-presets" autoFocus={isNew} />
            <datalist id="objective-presets">{OBJECTIVE_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Perspectiva"><EnumSelect value={perspective} options={PERSPECTIVES} onChange={setPerspective} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={status} options={OBJECTIVE_STATUSES} onChange={setStatus} disabled={readOnly} /></Field>
          <Field label="Responsável" className="sm:col-span-2"><PersonSelect value={owner} onChange={setOwner} disabled={readOnly} /></Field>
          <Field label="Descrição" className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

const NONE = "__none__";

function KeyResultDialog({ state, onClose }: { state: { objective: ObjectiveRow; kr: KeyResultRow | null } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: indicators = [] } = useIndicators();
  const [d, setD] = useState({ title: "", unit: "", baseline: "", target: "", current: "", indicator_id: null as string | null, owner_id: null as string | null, due_date: "" });
  const [busy, setBusy] = useState(false);
  const kr = state?.kr ?? null;

  useEffect(() => {
    if (!state) return;
    setD({
      title: kr?.title ?? "", unit: kr?.unit ?? "", baseline: moneyInput(kr?.baseline), target: moneyInput(kr?.target), current: moneyInput(kr?.current),
      indicator_id: kr?.indicator_id ?? null, owner_id: kr?.owner_id ?? null, due_date: kr?.due_date ?? "",
    });
  }, [state, kr]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const baseline = parseMoney(d.baseline), target = parseMoney(d.target), current = parseMoney(d.current);
    if ([baseline, target, current].some(Number.isNaN) || !d.target.trim()) return void toast.error("Informe meta e valores numéricos.");
    setBusy(true);
    try {
      await persist("key_results", kr, {
        objective_id: state!.objective.id, title: d.title.trim(), unit: d.unit.trim(), baseline, target, current,
        indicator_id: d.indicator_id, owner_id: d.owner_id, due_date: orNull(d.due_date), updated_at: new Date().toISOString(),
      });
      toast.success("Resultado-chave salvo.");
      void qc.invalidateQueries({ queryKey: ["key_results"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!kr || !window.confirm(`Remover “${kr.title}”?`)) return;
    try {
      await deleteRow("key_results", kr.id);
      void qc.invalidateQueries({ queryKey: ["key_results"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <EntityDialog
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      title={kr ? "Editar resultado-chave" : "Novo resultado-chave"}
      description={state?.objective.title}
      formId="kr-form"
      isNew={!kr}
      busy={busy}
      form={
        <form id="kr-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Resultado-chave" className="sm:col-span-3"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required placeholder="Ex.: 1.200 novos cooperados" /></Field>
          <Field label="Ponto de partida"><Input inputMode="decimal" value={d.baseline} onChange={(e) => setD({ ...d, baseline: e.target.value })} placeholder="0" /></Field>
          <Field label="Meta"><Input inputMode="decimal" value={d.target} onChange={(e) => setD({ ...d, target: e.target.value })} required /></Field>
          <Field label="Unidade"><Input value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} placeholder="pessoas, %, R$" /></Field>
          <Field label="Medir pelo indicador" className="sm:col-span-2" hint="Com indicador mensal, o valor atual é a soma dos meses do ano.">
            <Select value={d.indicator_id ?? NONE} onValueChange={(v) => setD({ ...d, indicator_id: v === NONE ? null : v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Informar manualmente</SelectItem>
                {indicators.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.frequency})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Valor atual"><Input inputMode="decimal" value={d.current} onChange={(e) => setD({ ...d, current: e.target.value })} disabled={!!d.indicator_id} /></Field>
          <Field label="Responsável" className="sm:col-span-2"><PersonSelect value={d.owner_id} onChange={(v) => setD({ ...d, owner_id: v })} /></Field>
          <Field label="Prazo"><Input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></Field>
          {kr && (
            <div className="sm:col-span-3">
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()}>
                <Trash2 className="h-4 w-4" /> Remover resultado-chave
              </Button>
            </div>
          )}
        </form>
      }
    />
  );
}
