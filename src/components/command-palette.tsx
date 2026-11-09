// Busca global (Ctrl K / ⌘ K): encontra registros de todos os módulos, abre telas e cria itens.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command as Cmd } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { navGroups } from "@/lib/navigation";
import { usePermissions, type ModuleKey } from "@/lib/permissions";
import { useQuickCreate } from "@/components/quick-create";

type Hit = { id: string; label: string; sub: string; group: string; to: string; params?: Record<string, string> };

/** O que a busca procura: tabela, coluna do nome, módulo exigido e para onde leva. */
const SOURCES: { table: string; col: string; extra?: string; group: string; module: ModuleKey; to: string; detail?: boolean; sub: (r: Record<string, unknown>) => string }[] = [
  { table: "campaigns", col: "name", extra: "status, start_date", group: "Campanhas", module: "campanhas", to: "/campanhas/$id", detail: true, sub: (r) => String(r.status ?? "") },
  { table: "projects", col: "name", extra: "status", group: "Projetos", module: "projetos", to: "/projetos/$id", detail: true, sub: (r) => String(r.status ?? "") },
  { table: "tasks", col: "title", extra: "status", group: "Tarefas", module: "kanban", to: "/kanban", sub: (r) => String(r.status ?? "") },
  { table: "contracts", col: "object", extra: "company", group: "Contratos", module: "contratos", to: "/contratos/$id", detail: true, sub: (r) => String(r.company ?? "") },
  { table: "partners", col: "company", extra: "category", group: "Parceiros", module: "parceiros", to: "/parceiros/$id", detail: true, sub: (r) => String(r.category ?? "") },
  { table: "events", col: "name", extra: "event_date", group: "Eventos", module: "eventos", to: "/eventos/$id", detail: true, sub: (r) => String(r.event_date ?? "") },
  { table: "sponsorships", col: "event_name", extra: "institution", group: "Patrocínios", module: "patrocinios", to: "/patrocinios", sub: (r) => String(r.institution ?? "") },
  { table: "content_items", col: "title", extra: "category", group: "Conteúdos", module: "conteudos", to: "/conteudos", sub: (r) => String(r.category ?? "") },
  { table: "offline_media", col: "title", extra: "city", group: "Mídia offline", module: "midia", to: "/midia-offline", sub: (r) => String(r.city ?? "") },
];

// O cliente tipado não aceita nome de tabela variável; a busca só lê colunas simples.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromAny = (table: string) => (supabase as any).from(table);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const { can } = usePermissions();
  const quick = useQuickCreate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  // Busca no banco (respeita as permissões de cada pessoa), com uma pequena espera entre teclas
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const pattern = `%${term.replace(/[%_,()]/g, " ")}%`;
      const results = await Promise.all(
        SOURCES.filter((s) => can(s.module, "view")).map(async (s) => {
          const { data } = await fromAny(s.table)
            .select(`id, ${s.col}${s.extra ? `, ${s.extra}` : ""}`)
            .is("deleted_at", null)
            .ilike(s.col, pattern)
            .limit(5);
          return ((data ?? []) as unknown as Record<string, unknown>[]).map<Hit>((r) => ({
            id: `${s.table}:${String(r.id)}`,
            label: String(r[s.col] ?? ""),
            sub: s.sub(r),
            group: s.group,
            to: s.to,
            params: s.detail ? { id: String(r.id) } : undefined,
          }));
        }),
      );
      if (!cancelled) {
        setHits(results.flat());
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, can]);

  const pages = useMemo(() => {
    const term = norm(q.trim());
    return navGroups
      .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
      .filter((i) => can(i.module, "view"))
      .filter((i) => !term || norm(`${i.title} ${i.group}`).includes(term))
      .slice(0, term ? 6 : 8);
  }, [q, can]);

  const creates = useMemo(() => {
    const term = norm(q.trim());
    return quick.options.filter((o) => !term || norm(`criar novo nova ${o.label}`).includes(term)).slice(0, term ? 4 : 8);
  }, [q, quick.options]);

  const groups = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of hits) map.set(h.group, [...(map.get(h.group) ?? []), h]);
    return [...map.entries()];
  }, [hits]);

  const go = (to: string, params?: Record<string, string>) => {
    onOpenChange(false);
    void nav({ to: to as "/", params: params as never });
  };

  const itemCls =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm aria-selected:bg-primary/12 aria-selected:text-foreground data-[disabled=true]:opacity-50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Buscar ou criar</DialogTitle>
        <Cmd shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <Cmd.Input
              value={q}
              onValueChange={setQ}
              placeholder="Buscar campanha, contrato, parceiro, tarefa… ou criar"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {loading && <span className="text-xs text-muted-foreground">buscando…</span>}
          </div>
          <Cmd.List className="max-h-[min(60vh,480px)] overflow-y-auto p-2">
            <Cmd.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {q.trim().length < 2 ? "Digite pelo menos 2 letras para buscar." : loading ? "Buscando…" : "Nada encontrado com esse nome."}
            </Cmd.Empty>

            {groups.map(([group, list]) => (
              <Cmd.Group key={group} heading={group} className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
                {list.map((h) => (
                  <Cmd.Item key={h.id} value={h.id} onSelect={() => go(h.to, h.params)} className={itemCls}>
                    <span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                    {h.sub && <span className="max-w-[40%] truncate text-xs text-muted-foreground">{h.sub}</span>}
                  </Cmd.Item>
                ))}
              </Cmd.Group>
            ))}

            {creates.length > 0 && (
              <Cmd.Group heading="Criar" className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
                {creates.map((o) => (
                  <Cmd.Item
                    key={o.kind}
                    value={`criar-${o.kind}`}
                    onSelect={() => {
                      onOpenChange(false);
                      quick.open(o.kind);
                    }}
                    className={itemCls}
                  >
                    <o.icon className="h-4 w-4 shrink-0 text-primary-ink" />
                    <span className="flex-1">Criar {o.label.toLowerCase()}</span>
                    <span className="text-xs text-muted-foreground">{o.hint}</span>
                  </Cmd.Item>
                ))}
              </Cmd.Group>
            )}

            {pages.length > 0 && (
              <Cmd.Group heading="Ir para" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
                {pages.map((p) => (
                  <Cmd.Item key={p.to} value={`ir-${p.to}`} onSelect={() => go(p.to)} className={itemCls}>
                    <p.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{p.title}</span>
                    <span className="text-xs text-muted-foreground">{p.group}</span>
                  </Cmd.Item>
                ))}
              </Cmd.Group>
            )}
          </Cmd.List>
          <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:flex">
            <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> abrir</span>
            <span>↑ ↓ navegar</span>
            <span>Esc fechar</span>
          </div>
        </Cmd>
      </DialogContent>
    </Dialog>
  );
}

/** Abre a busca com Ctrl K / ⌘ K. */
export function useCommandShortcut(setOpen: (fn: (o: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
