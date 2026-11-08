import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, FileText, Loader2, Plus, RotateCcw, Search, Star } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSelect, EnumSelect, Field, Pill, ProjectSelect, splitList } from "@/components/ops/fields";
import { DeleteRecordButton, EmptyState, RecordHistory } from "@/components/ops/record-panels";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { supabase } from "@/integrations/supabase/client";
import type { ContentItemRow } from "@/integrations/supabase/types";
import { insertRow, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { CONTENT_CATEGORIES, CONTENT_STATUSES, useCampaigns, useContents, useContentVersions, useFavorites } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/conteudos")({
  head: () => ({ meta: [{ title: "Conteúdos — Marketing Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  component: () => (
    <ModuleGuard module="conteudos">
      <ContentPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const FAV = "__fav__";
const NEW = "new";

function ContentPage() {
  const nav = useNavigate({ from: "/conteudos" });
  const { id: openId } = Route.useSearch();
  const { data: items = [], isLoading } = useContents();
  const { data: favorites = new Set<string>() } = useFavorites();
  const { data: campaigns = [] } = useCampaigns();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (c) =>
        (category === ALL || (category === FAV ? favorites.has(c.id) : c.category === category)) &&
        (status === ALL || c.status === status) &&
        (!term ||
          c.title.toLowerCase().includes(term) ||
          c.body.toLowerCase().includes(term) ||
          c.tags.some((t) => t.toLowerCase().includes(term))),
    );
  }, [items, q, category, status, favorites]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [items]);

  const waiting = items.filter((c) => c.status === "Aguardando aprovação").length;
  const setOpen = (id: string | undefined) => void nav({ search: id ? { id } : {}, replace: true });
  const selected = openId && openId !== NEW ? items.find((c) => c.id === openId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Conteúdos"
        description="Biblioteca de textos da equipe: legendas, roteiros, spots, e-mails e mais, com versões e aprovação."
        actions={
          <Can module="conteudos" action="create">
            <Button onClick={() => setOpen(NEW)}>
              <Plus className="h-4 w-4" /> Novo conteúdo
            </Button>
          </Can>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-0.5">
          <CategoryButton active={category === ALL} onClick={() => setCategory(ALL)} label="Todos" count={items.length} />
          <CategoryButton active={category === FAV} onClick={() => setCategory(FAV)} label="Meus favoritos" count={favorites.size} />
          <div className="my-2 border-t border-border" />
          {CONTENT_CATEGORIES.map((c) => (
            <CategoryButton key={c} active={category === c} onClick={() => setCategory(c)} label={c} count={counts.get(c) ?? 0} />
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar no título, texto ou tags" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                {CONTENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {waiting > 0 && status === ALL && (
            <button
              type="button"
              onClick={() => setStatus("Aguardando aprovação")}
              className="mb-4 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left text-sm"
            >
              {waiting === 1 ? "1 conteúdo aguardando aprovação" : `${waiting} conteúdos aguardando aprovação`} — ver
            </button>
          )}

          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={FileText} title={items.length ? "Nada com esses filtros" : "A biblioteca está vazia"} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpen(c.id)}
                  className="flex flex-col rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Pill value={c.category} />
                    {favorites.has(c.id) && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold">{c.title}</div>
                  <p className="mt-1 line-clamp-3 flex-1 whitespace-pre-line text-xs text-muted-foreground">{c.description || c.body}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Pill value={c.status} />
                    <span className="truncate text-[11px] text-muted-foreground">
                      {campaigns.find((x) => x.id === c.campaign_id)?.name ?? format(new Date(c.updated_at), "dd/MM/yy")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContentSheet
        open={!!openId}
        item={selected}
        isNew={openId === NEW}
        notFound={!!openId && openId !== NEW && !isLoading && !selected}
        isFavorite={!!selected && favorites.has(selected.id)}
        onClose={() => setOpen(undefined)}
        onCreated={(id) => setOpen(id)}
      />
    </>
  );
}

function CategoryButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-primary/12 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  );
}

// ----------------------------------------------------------------- Painel do conteúdo

type Draft = {
  title: string;
  category: string;
  description: string;
  body: string;
  tags: string;
  campaign_id: string | null;
  project_id: string | null;
};

const toDraft = (c: ContentItemRow | null): Draft => ({
  title: c?.title ?? "",
  category: c?.category ?? "Legendas",
  description: c?.description ?? "",
  body: c?.body ?? "",
  tags: (c?.tags ?? []).join(", "),
  campaign_id: c?.campaign_id ?? null,
  project_id: c?.project_id ?? null,
});

function ContentSheet({
  open,
  item,
  isNew,
  notFound,
  isFavorite,
  onClose,
  onCreated,
}: {
  open: boolean;
  item: ContentItemRow | null;
  isNew: boolean;
  notFound: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const [d, setD] = useState<Draft>(toDraft(item));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const canEdit = isNew ? can("conteudos", "create") : can("conteudos", "edit");
  const canApprove = can("conteudos", "approve");

  useEffect(() => {
    setD(toDraft(item));
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.updated_at, isNew]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const dirty = !!item && JSON.stringify(toDraft(item)) !== JSON.stringify(d);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const values = {
      title: d.title.trim(),
      category: d.category,
      description: d.description,
      body: d.body,
      tags: splitList(d.tags),
      campaign_id: d.campaign_id,
      project_id: d.project_id,
    };
    try {
      if (isNew) {
        const row = await insertRow<ContentItemRow>("content_items", values);
        toast.success("Conteúdo criado.");
        onCreated(row.id);
      } else {
        const row = await updateRow<ContentItemRow>("content_items", item!.id, values);
        toast.success(row.status !== item!.status ? `Salvo. Status voltou para “${row.status}” por causa da alteração.` : "Salvo.");
      }
      void qc.invalidateQueries({ queryKey: ["content_items"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string, extra: Record<string, unknown> = {}) {
    if (!item) return;
    if (dirty) {
      toast.error("Salve as alterações antes de mudar o status.");
      return;
    }
    setBusy(true);
    try {
      await updateRow("content_items", item.id, { status, ...extra });
      toast.success(`Status: ${status}.`);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["content_items"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!item) return;
    const { error } = isFavorite
      ? await supabase.from("content_favorites").delete().eq("content_id", item.id)
      : await supabase.from("content_favorites").insert({ content_id: item.id });
    if (error) return toast.error(errorMessage(error));
    void qc.invalidateQueries({ queryKey: ["content_favorites"] });
  }

  const s = item?.status;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {notFound ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Conteúdo não encontrado. Ele pode ter sido excluído.</div>
        ) : (
          <>
            <SheetHeader className="mb-4">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <SheetTitle className="truncate">{isNew ? "Novo conteúdo" : item?.title}</SheetTitle>
                  <SheetDescription asChild>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item ? (
                        <>
                          <Pill value={item.status} />
                          {item.approved_by && item.approved_at && (
                            <span className="text-xs text-muted-foreground">
                              aprovado por {profileName(profiles, item.approved_by)} em {format(new Date(item.approved_at), "dd/MM/yy")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs">Nasce como rascunho.</span>
                      )}
                    </div>
                  </SheetDescription>
                </div>
                {item && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" aria-label="Copiar texto" onClick={() => void navigator.clipboard.writeText(item.body).then(() => toast.success("Texto copiado."))}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={isFavorite ? "Tirar dos favoritos" : "Favoritar"} onClick={() => void toggleFavorite()}>
                      <Star className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
                    </Button>
                  </div>
                )}
              </div>
            </SheetHeader>

            {item && (
              <WorkflowBar
                status={s!}
                reviewNote={item.review_note}
                canEdit={can("conteudos", "edit")}
                canApprove={canApprove}
                busy={busy}
                note={note}
                setNote={setNote}
                onStatus={changeStatus}
              />
            )}

            <Tabs defaultValue="texto">
              {!isNew && (
                <TabsList className="mb-3">
                  <TabsTrigger value="texto">Texto</TabsTrigger>
                  <TabsTrigger value="versoes">Versões</TabsTrigger>
                  <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
                  <TabsTrigger value="comentarios">Comentários</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="texto" forceMount className="data-[state=inactive]:hidden">
                <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
                  <Field label="Título" className="sm:col-span-2">
                    <Input value={d.title} onChange={(e) => set("title", e.target.value)} required disabled={!canEdit} />
                  </Field>
                  <Field label="Categoria">
                    <EnumSelect value={d.category} options={CONTENT_CATEGORIES} onChange={(v) => set("category", v)} disabled={!canEdit} />
                  </Field>
                  <Field label="Tags" hint="Separe por vírgula.">
                    <Input value={d.tags} onChange={(e) => set("tags", e.target.value)} disabled={!canEdit} />
                  </Field>
                  <Field label="Campanha">
                    <CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={!canEdit} />
                  </Field>
                  <Field label="Projeto">
                    <ProjectSelect value={d.project_id} onChange={(v) => set("project_id", v)} campaignId={d.campaign_id} disabled={!canEdit} />
                  </Field>
                  <Field label="Resumo / uso" className="sm:col-span-2">
                    <Input value={d.description} onChange={(e) => set("description", e.target.value)} disabled={!canEdit} placeholder="Onde e quando usar este texto" />
                  </Field>
                  <Field label="Texto" className="sm:col-span-2" hint={`${d.body.length} caracteres`}>
                    <Textarea value={d.body} onChange={(e) => set("body", e.target.value)} rows={14} disabled={!canEdit} className="font-mono text-[13px] leading-relaxed" />
                  </Field>
                  {canEdit && (
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <div>{item && can("conteudos", "delete") && <DeleteRecordButton table="content_items" id={item.id} label={item.title} onDeleted={onClose} />}</div>
                      <Button type="submit" disabled={busy || (!isNew && !dirty)}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isNew ? "Criar conteúdo" : "Salvar"}
                      </Button>
                    </div>
                  )}
                  {item && canEdit && !canApprove && (s === "Aprovado" || s === "Publicado") && (
                    <p className="text-xs text-muted-foreground sm:col-span-2">Alterar o texto de um conteúdo aprovado faz ele voltar para revisão.</p>
                  )}
                </form>
              </TabsContent>
              {item && (
                <>
                  <TabsContent value="versoes">
                    <Versions item={item} canEdit={can("conteudos", "edit")} onRestore={(v) => setD((x) => ({ ...x, title: v.title, body: v.body }))} />
                  </TabsContent>
                  <TabsContent value="arquivos">
                    <RecordAttachments module="conteudos" recordId={item.id} />
                  </TabsContent>
                  <TabsContent value="comentarios">
                    <RecordComments module="conteudos" recordId={item.id} />
                  </TabsContent>
                  <TabsContent value="historico">
                    <RecordHistory table="content_items" recordId={item.id} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function WorkflowBar({
  status,
  reviewNote,
  canEdit,
  canApprove,
  busy,
  note,
  setNote,
  onStatus,
}: {
  status: string;
  reviewNote: string;
  canEdit: boolean;
  canApprove: boolean;
  busy: boolean;
  note: string;
  setNote: (v: string) => void;
  onStatus: (status: string, extra?: Record<string, unknown>) => void;
}) {
  const actions: { label: string; status: string; primary?: boolean; extra?: Record<string, unknown> }[] = [];
  if (canEdit && (status === "Rascunho" || status === "Em revisão")) {
    actions.push({ label: "Pedir aprovação", status: "Aguardando aprovação", primary: true, extra: { review_note: "" } });
  }
  if (canEdit && status === "Rascunho") actions.push({ label: "Mandar para revisão", status: "Em revisão" });
  if (canApprove && status === "Aguardando aprovação") {
    actions.push({ label: "Aprovar", status: "Aprovado", primary: true, extra: { review_note: note.trim() } });
    actions.push({ label: "Devolver para ajustes", status: "Em revisão", extra: { review_note: note.trim() } });
  }
  if ((canEdit || canApprove) && status === "Aprovado") actions.push({ label: "Marcar como publicado", status: "Publicado", primary: true });
  if (canEdit && status !== "Arquivado") actions.push({ label: "Arquivar", status: "Arquivado" });
  if (canEdit && status === "Arquivado") actions.push({ label: "Reabrir como rascunho", status: "Rascunho" });

  if (actions.length === 0 && !reviewNote) return null;

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      {reviewNote && (
        <p className="text-sm">
          <span className="text-muted-foreground">Observação da revisão: </span>
          <span className="whitespace-pre-wrap">{reviewNote}</span>
        </p>
      )}
      {canApprove && status === "Aguardando aprovação" && (
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Observação para quem escreveu (opcional)" />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.primary ? "default" : "outline"} disabled={busy} onClick={() => onStatus(a.status, a.extra)}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Versions({
  item,
  canEdit,
  onRestore,
}: {
  item: ContentItemRow;
  canEdit: boolean;
  onRestore: (v: { title: string; body: string }) => void;
}) {
  const { data: versions = [], isLoading } = useContentVersions(item.id);
  const { data: profiles } = useProfiles();
  const [openId, setOpenId] = useState<string | null>(null);
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Cada vez que o título ou o texto é salvo, uma versão é guardada automaticamente.</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {versions.map((v, i) => (
          <li key={v.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
                <div className="text-sm font-medium">
                  v{v.version_no} {i === 0 && <span className="text-xs font-normal text-primary">atual</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {profileName(profiles, v.created_by)} · {format(new Date(v.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
              </button>
              {i > 0 && canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onRestore(v);
                    toast.info(`Texto da v${v.version_no} carregado na aba Texto. Clique em Salvar para confirmar.`);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Usar esta
                </Button>
              )}
            </div>
            {openId === v.id && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-xs">{v.body}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
