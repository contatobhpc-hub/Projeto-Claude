import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Gift, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Stat } from "@/components/ops/record-panels";
import { InventoryItemDialog, MovementForm } from "@/components/ops/materials-dialogs";
import { AlertPill } from "@/components/ops/rel-fields";
import type { InventoryItemRow } from "@/integrations/supabase/types";
import { brl } from "@/lib/operacao";
import { ALERT_TONE, INVENTORY_CATEGORIES, stockLevel, useInventory } from "@/lib/relacionamento";

export const Route = createFileRoute("/brindes")({
  head: () => ({ meta: [{ title: "Brindes — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="brindes">
      <InventoryPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const LEVEL_LABEL = { out: "Sem estoque", low: "Estoque baixo", ok: "OK" } as const;
const LEVEL_TONE = { out: ALERT_TONE.expired, low: ALERT_TONE.soon, ok: ALERT_TONE.ok } as const;

function InventoryPage() {
  const { data: items = [], isLoading } = useInventory();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [open, setOpen] = useState<InventoryItemRow | "new" | null>(null);
  const [moving, setMoving] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === ALL || i.category === category) &&
        (level === ALL || stockLevel(i) === level) &&
        (!t || `${i.name} ${i.code} ${i.supplier} ${i.location}`.toLowerCase().includes(t)),
    );
  }, [items, q, category, level]);

  const value = items.reduce((s, i) => s + i.quantity * Number(i.unit_value || 0), 0);
  const low = items.filter((i) => stockLevel(i) !== "ok").length;
  const reserved = items.reduce((s, i) => s + i.reserved, 0);

  return (
    <>
      <PageHeader
        title="Brindes"
        description="Estoque de brindes e materiais. O saldo muda só por movimentações, e cada uma fica registrada com autor e data."
        actions={
          <div className="flex gap-2">
            <Can module="brindes" action="edit">
              <Button variant="outline" onClick={() => setMoving(true)}><ArrowLeftRight className="h-4 w-4" /> Movimentar</Button>
            </Can>
            <Can module="brindes" action="create">
              <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Novo brinde</Button>
            </Can>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Itens cadastrados" value={String(items.length)} />
        <Stat label="Valor em estoque" value={brl(value)} />
        <Stat label="Unidades reservadas" value={String(reserved)} />
        <Stat label="Com estoque baixo ou zerado" value={String(low)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, código, fornecedor ou local" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {INVENTORY_CATEGORIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer saldo</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="out">Sem estoque</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && items.length === 0 ? (
        <EmptyState icon={Gift} title="Nenhum brinde cadastrado" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brinde</TableHead>
                <TableHead className="w-[110px] text-right">Disponível</TableHead>
                <TableHead className="w-[100px] text-right">Reservado</TableHead>
                <TableHead className="w-[90px] text-right">Mínimo</TableHead>
                <TableHead className="w-[150px]">Local</TableHead>
                <TableHead className="w-[130px]">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum item com esses filtros.</TableCell></TableRow>}
              {rows.map((i) => {
                const lv = stockLevel(i);
                return (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => setOpen(i)}>
                    <TableCell>
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-muted-foreground">{[i.code, i.category, i.supplier].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{i.quantity - i.reserved}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{i.reserved}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{i.min_quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.location || "—"}</TableCell>
                    <TableCell><AlertPill tone={LEVEL_TONE[lv]}>{LEVEL_LABEL[lv]}</AlertPill></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sempre a versão atual do item (o saldo muda a cada movimentação) */}
      <InventoryItemDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        item={open && open !== "new" ? (items.find((i) => i.id === open.id) ?? open) : null}
      />

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar movimentação</DialogTitle>
            <DialogDescription>Entradas, saídas, reservas para eventos e contagens de inventário.</DialogDescription>
          </DialogHeader>
          <MovementForm onDone={() => setMoving(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
