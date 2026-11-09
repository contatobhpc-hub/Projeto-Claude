import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Radio, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Stat } from "@/components/ops/record-panels";
import { MediaDialog } from "@/components/ops/materials-dialogs";
import { AlertPill } from "@/components/ops/rel-fields";
import { brl, fmtDate, useCampaigns } from "@/lib/operacao";
import { ALERT_TONE, MEDIA_STATUSES, removalAlert, useAppLists, useOfflineMedia } from "@/lib/relacionamento";

export const Route = createFileRoute("/midia-offline")({
  head: () => ({ meta: [{ title: "Mídia Offline — Marketing Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  component: () => (
    <ModuleGuard module="midia">
      <MediaPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const NEW = "new";

function MediaPage() {
  const nav = useNavigate({ from: "/midia-offline" });
  const { id: openId } = Route.useSearch();
  const { data: list = [], isLoading } = useOfflineMedia();
  const { data: campaigns = [] } = useCampaigns();
  const lists = useAppLists();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [city, setCity] = useState(ALL);

  const cities = useMemo(() => [...new Set(list.map((m) => m.city).filter(Boolean))].sort(), [list]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter(
      (m) =>
        (status === ALL || m.status === status) &&
        (format === ALL || m.categories.includes(format)) &&
        (city === ALL || m.city === city) &&
        (!t || `${m.title} ${m.location} ${m.supplier}`.toLowerCase().includes(t)),
    );
  }, [list, q, status, format, city]);

  const installed = list.filter((m) => m.status === "Instalado");
  const toRemove = list.filter((m) => ["expired", "critical", "soon"].includes(removalAlert(m).level));
  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;

  const setOpen = (id: string | undefined) => void nav({ search: id ? { id } : {}, replace: true });
  const selected = openId && openId !== NEW ? list.find((m) => m.id === openId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Mídia Offline"
        description="Outdoors, painéis, faixas, busdoor e materiais impressos, com datas de instalação e retirada."
        actions={
          <Can module="midia" action="create">
            <Button onClick={() => setOpen(NEW)}><Plus className="h-4 w-4" /> Nova mídia</Button>
          </Can>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Instaladas agora" value={String(installed.length)} />
        <Stat label="Retirada atrasada ou nos próximos 7 dias" value={String(toRemove.length)} />
        <Stat label="Investimento (sem canceladas)" value={brl(list.filter((m) => m.status !== "Cancelado").reduce((s, m) => s + Number(m.value || 0), 0))} />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por título, local ou fornecedor" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {MEDIA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os formatos</SelectItem>
            {lists.media_categories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as cidades</SelectItem>
            {cities.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && list.length === 0 ? (
        <EmptyState icon={Radio} title="Nenhuma mídia cadastrada" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mídia</TableHead>
                <TableHead className="w-[200px]">Local</TableHead>
                <TableHead className="w-[190px]">Período</TableHead>
                <TableHead className="w-[160px]">Status</TableHead>
                <TableHead className="w-[110px] text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma mídia com esses filtros.</TableCell></TableRow>}
              {rows.map((m) => {
                const a = removalAlert(m);
                return (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpen(m.id)}>
                    <TableCell>
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-muted-foreground">{[m.categories.join(", "), campaignName(m.campaign_id)].filter(Boolean).join(" · ") || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{m.city || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.location}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(m.install_date)} – {fmtDate(m.removal_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Pill value={m.status} />
                        {a.level !== "none" && <AlertPill tone={ALERT_TONE[a.level]}>{a.label}</AlertPill>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{brl(Number(m.value || 0))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <MediaDialog open={!!openId} onOpenChange={(o) => !o && setOpen(undefined)} media={selected} />
    </>
  );
}
