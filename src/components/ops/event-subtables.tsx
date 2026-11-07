// Cronograma, convidados e fornecedores de um evento.

import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonSelect } from "@/components/ops/fields";
import type { EventAttendeeRow, EventScheduleRow, EventSupplierRow } from "@/integrations/supabase/types";
import { deleteRow, insertRow, parseMoney, updateRow, useRows, type LiveTable } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { brl } from "@/lib/operacao";
import { profileName, useProfiles } from "@/lib/team";

function useSub<T>(table: LiveTable, eventId: string, order: string) {
  return useRows<T>(table, { filters: [{ column: "event_id", value: eventId }], order, ascending: true, softDeleted: false });
}

function useMutate(table: LiveTable) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [table] });
  return {
    add: async (values: Record<string, unknown>) => {
      try {
        await insertRow(table, values);
        void refresh();
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        return false;
      }
    },
    patch: async (id: string, values: Record<string, unknown>) => {
      try {
        await updateRow(table, id, values);
      } catch (err) {
        toast.error(errorMessage(err));
      }
      void refresh();
    },
    remove: async (id: string) => {
      try {
        await deleteRow(table, id);
      } catch (err) {
        toast.error(errorMessage(err));
      }
      void refresh();
    },
  };
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={label} onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

// ----------------------------------------------------------------- Cronograma

export function ScheduleEditor({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { data: rows = [] } = useSub<EventScheduleRow>("event_schedule", eventId, "starts_at");
  const { data: profiles } = useProfiles();
  const m = useMutate("event_schedule");
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await m.add({ event_id: eventId, starts_at: time || null, title: title.trim(), owner_id: owner })) {
      setTime("");
      setTitle("");
    }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item no cronograma.</p>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-14 shrink-0 text-sm font-medium tabular-nums">{r.starts_at?.slice(0, 5) ?? "—"}</span>
              <span className="min-w-0 flex-1 text-sm">{r.title}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{r.owner_id ? profileName(profiles, r.owner_id) : ""}</span>
              {canEdit && <RemoveButton label={`Remover ${r.title}`} onClick={() => void m.remove(r.id)} />}
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[110px_1fr_200px_auto]">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Horário" />
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Abertura com o presidente" aria-label="Atividade" />
          <PersonSelect value={owner} onChange={setOwner} placeholder="Sem responsável" />
          <Button type="submit" variant="outline" disabled={!title.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Convidados

export function AttendeesEditor({ eventId, canEdit, eventName }: { eventId: string; canEdit: boolean; eventName: string }) {
  const { data: rows = [] } = useSub<EventAttendeeRow>("event_attendees", eventId, "name");
  const m = useMutate("event_attendees");
  const [q, setQ] = useState("");
  const [d, setD] = useState({ name: "", organization: "", role: "", email: "", phone: "" });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.name} ${r.organization} ${r.role}`.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return;
    if (await m.add({ event_id: eventId, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])) })) {
      setD({ name: "", organization: "", role: "", email: "", phone: "" });
    }
  }

  function exportCsv() {
    const header = ["Nome", "Organização", "Cargo", "E-mail", "Telefone", "Confirmado", "Presente"];
    const lines = rows.map((r) =>
      [r.name, r.organization, r.role, r.email, r.phone, r.confirmed ? "sim" : "não", r.checked_in ? "sim" : "não"]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `convidados-${eventName.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const confirmed = rows.filter((r) => r.confirmed).length;
  const present = rows.filter((r) => r.checked_in).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} convidados · {confirmed} confirmados · {present} presentes
        </p>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="h-8 w-40" />
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> Planilha
          </Button>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Organização / cargo</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="w-[90px] text-center">Confirmou</TableHead>
                <TableHead className="w-[90px] text-center">Presente</TableHead>
                {canEdit && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[r.organization, r.role].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{[r.email, r.phone].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={r.confirmed} disabled={!canEdit} onCheckedChange={(v) => void m.patch(r.id, { confirmed: v === true })} aria-label={`${r.name} confirmou`} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={r.checked_in} disabled={!canEdit} onCheckedChange={(v) => void m.patch(r.id, { checked_in: v === true })} aria-label={`${r.name} presente`} />
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <RemoveButton label={`Remover ${r.name}`} onClick={() => void m.remove(r.id)} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-6">
          <Input className="sm:col-span-2" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Nome" aria-label="Nome" />
          <Input value={d.organization} onChange={(e) => setD({ ...d, organization: e.target.value })} placeholder="Organização" aria-label="Organização" />
          <Input value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })} placeholder="Cargo" aria-label="Cargo" />
          <Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="Telefone" aria-label="Telefone" />
          <Button type="submit" variant="outline" disabled={!d.name.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Fornecedores

export function SuppliersEditor({ eventId, canEdit, budget }: { eventId: string; canEdit: boolean; budget: number }) {
  const { data: rows = [] } = useSub<EventSupplierRow>("event_suppliers", eventId, "created_at");
  const m = useMutate("event_suppliers");
  const [d, setD] = useState({ name: "", service: "", contact: "", value: "" });
  const total = rows.reduce((s, r) => s + Number(r.value || 0), 0);

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value);
    if (!d.name.trim()) return;
    if (Number.isNaN(value) || value < 0) return void toast.error("Valor inválido.");
    if (await m.add({ event_id: eventId, name: d.name.trim(), service: d.service.trim(), contact: d.contact.trim(), value })) {
      setD({ name: "", service: "", contact: "", value: "" });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Total com fornecedores: <strong className="text-foreground">{brl(total)}</strong>
        {budget > 0 && (
          <span className={total > budget ? " font-medium text-red-500" : ""}>
            {" "}
            de {brl(budget)} orçados ({Math.round((total / budget) * 100)}%)
          </span>
        )}
      </p>
      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground"> · {[r.service, r.contact].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="tabular-nums">{brl(Number(r.value || 0))}</span>
              {canEdit && <RemoveButton label={`Remover ${r.name}`} onClick={() => void m.remove(r.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-5">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Fornecedor" aria-label="Fornecedor" />
          <Input value={d.service} onChange={(e) => setD({ ...d, service: e.target.value })} placeholder="Serviço" aria-label="Serviço" />
          <Input value={d.contact} onChange={(e) => setD({ ...d, contact: e.target.value })} placeholder="Contato" aria-label="Contato" />
          <Input inputMode="decimal" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} placeholder="Valor (R$)" aria-label="Valor" />
          <Button type="submit" variant="outline" disabled={!d.name.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}
