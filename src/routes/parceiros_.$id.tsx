import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, ScrollText } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { DeleteRecordButton, EmptyState, InfoRow, Panel, RecordChecklist, RecordHistory, Stat } from "@/components/ops/record-panels";
import { ContractDialog, PartnerDialog } from "@/components/ops/rel-dialogs";
import { AlertPill } from "@/components/ops/rel-fields";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { brl, fmtDate } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { ALERT_TONE, contractAlert, useContracts, useMktEvents, useOfflineMedia, usePartner, useSponsorships } from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/parceiros_/$id")({
  head: () => ({ meta: [{ title: "Parceiro — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="parceiros">
      <PartnerPage />
    </ModuleGuard>
  ),
});

function PartnerPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const { data: p, isLoading } = usePartner(id);
  const filter = [{ column: "partner_id", value: id }];
  const { data: contracts = [] } = useContracts(filter);
  const { data: sponsorships = [] } = useSponsorships(filter);
  const { data: media = [] } = useOfflineMedia(filter);
  const { data: allEvents = [] } = useMktEvents();
  const events = allEvents.filter((e) => e.partner_ids.includes(id));
  const [editing, setEditing] = useState(false);
  const [newContract, setNewContract] = useState(false);

  if (isLoading) return <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!p) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-base font-semibold">Parceiro não encontrado</h2>
        <Button variant="outline" className="mt-4" asChild><Link to="/parceiros">Voltar para Parceiros</Link></Button>
      </div>
    );
  }

  const contracted = contracts.filter((c) => !["Cancelado"].includes(c.status)).reduce((s, c) => s + Number(c.value || 0), 0);
  const wa = p.whatsapp.replace(/\D/g, "");

  return (
    <>
      <Link to="/parceiros" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Parceiros
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.company}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill value={p.status} />
            <span className="text-sm text-muted-foreground">{[p.category, p.city].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {wa && (
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
              </Button>
            )}
            {p.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${p.phone}`}><Phone className="h-4 w-4" /> {p.phone}</a></Button>}
            {p.email && <Button size="sm" variant="outline" asChild><a href={`mailto:${p.email}`}><Mail className="h-4 w-4" /> E-mail</a></Button>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {can("parceiros", "edit") && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</Button>}
          {can("parceiros", "delete") && <DeleteRecordButton table="partners" id={p.id} label={p.company} onDeleted={() => void nav({ to: "/parceiros" })} />}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Valor contratado" value={brl(contracted)} hint={`${contracts.length} contratos`} />
        <Stat label="Patrocínios" value={String(sponsorships.length)} hint={brl(sponsorships.reduce((s, x) => s + Number(x.value || 0), 0))} />
        <Stat label="Eventos" value={String(events.length)} />
        <Stat label="Retorno entregue / esperado" value={`${brl(Number(p.delivered_return))}`} hint={`de ${brl(Number(p.expected_return))}`} />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          {can("contratos", "view") && <TabsTrigger value="contratos">Contratos ({contracts.length})</TabsTrigger>}
          {can("patrocinios", "view") && <TabsTrigger value="patrocinios">Patrocínios ({sponsorships.length})</TabsTrigger>}
          {can("eventos", "view") && <TabsTrigger value="eventos">Eventos ({events.length})</TabsTrigger>}
          {can("midia", "view") && <TabsTrigger value="midia">Mídia ({media.length})</TabsTrigger>}
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="comentarios">Comentários</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Dados" className="lg:col-span-2">
              <InfoRow label="Contato">{p.contact_name || "—"}</InfoRow>
              <InfoRow label="CNPJ / CPF">{p.document || "—"}</InfoRow>
              <InfoRow label="Responsável interno">{p.owner_id ? profileName(profiles, p.owner_id) : "—"}</InfoRow>
              <InfoRow label="Investimento mensal">{brl(Number(p.investment_month))}</InfoRow>
              <InfoRow label="Contrapartidas"><span className="whitespace-pre-wrap">{p.counterparts || "—"}</span></InfoRow>
              <InfoRow label="Observações"><span className="whitespace-pre-wrap">{p.notes || "—"}</span></InfoRow>
            </Panel>
            <Panel>
              <RecordChecklist module="parceiros" recordId={p.id} canEdit={can("parceiros", "edit")} />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="contratos">
          <div className="mb-3 flex justify-end">
            {can("contratos", "create") && <Button size="sm" onClick={() => setNewContract(true)}><Plus className="h-4 w-4" /> Novo contrato</Button>}
          </div>
          {contracts.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nenhum contrato com este parceiro" />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {contracts.map((c) => {
                const a = contractAlert(c);
                return (
                  <li key={c.id}>
                    <Link to="/contratos/$id" params={{ id: c.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.object}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(c.start_date)} – {fmtDate(c.end_date)} · {brl(Number(c.value))}</div>
                      </div>
                      {a.level !== "none" && a.level !== "ok" && <AlertPill tone={ALERT_TONE[a.level]}>{a.label}</AlertPill>}
                      <Pill value={c.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="patrocinios">
          <SimpleList
            empty="Nenhum patrocínio ligado"
            to="/patrocinios"
            items={sponsorships.map((s) => ({ id: s.id, title: s.event_name, sub: `${fmtDate(s.start_date)} · ${brl(Number(s.value))}`, status: s.status }))}
          />
        </TabsContent>
        <TabsContent value="eventos">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {events.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum evento com este parceiro.</li>}
            {events.map((e) => (
              <li key={e.id}>
                <Link to="/eventos/$id" params={{ id: e.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(e.event_date)} · {e.city || e.venue}</div>
                  </div>
                  <Pill value={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="midia">
          <SimpleList
            empty="Nenhuma mídia com este parceiro"
            to="/midia-offline"
            items={media.map((m) => ({ id: m.id, title: m.title, sub: `${fmtDate(m.install_date)} – ${fmtDate(m.removal_date)} · ${m.location}`, status: m.status }))}
          />
        </TabsContent>
        <TabsContent value="arquivos"><Panel><RecordAttachments module="parceiros" recordId={p.id} /></Panel></TabsContent>
        <TabsContent value="comentarios"><Panel><RecordComments module="parceiros" recordId={p.id} /></Panel></TabsContent>
        <TabsContent value="historico"><Panel><RecordHistory table="partners" recordId={p.id} /></Panel></TabsContent>
      </Tabs>

      <PartnerDialog open={editing} onOpenChange={setEditing} partner={p} />
      <ContractDialog open={newContract} onOpenChange={setNewContract} defaults={{ partner_id: p.id, company: p.company }} />
    </>
  );
}

function SimpleList({
  items,
  empty,
  to,
}: {
  items: { id: string; title: string; sub: string; status: string }[];
  empty: string;
  to: "/patrocinios" | "/midia-offline";
}) {
  if (items.length === 0) return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{empty}.</p>;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={to} search={{ id: i.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{i.title}</div>
              <div className="truncate text-xs text-muted-foreground">{i.sub}</div>
            </div>
            <Pill value={i.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
