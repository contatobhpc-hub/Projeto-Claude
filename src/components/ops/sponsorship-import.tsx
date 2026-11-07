// Importação de patrocínios a partir de planilha (Excel ou CSV), com pré-visualização.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { parseMoney } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { brl, fmtDate } from "@/lib/operacao";
import { SPONSORSHIP_CATEGORIES, tierFor } from "@/lib/relacionamento";

type Parsed = {
  ok: boolean;
  problem?: string;
  event_name: string;
  institution: string;
  city: string;
  start_date: string | null;
  end_date: string | null;
  value: number;
  category: string;
  notes: string;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Nomes de coluna aceitos (sem acento, minúsculo). */
const COLUMNS: Record<keyof Omit<Parsed, "ok" | "problem">, string[]> = {
  event_name: ["evento", "nome do evento", "acao", "projeto", "event"],
  institution: ["instituicao", "descricao", "organizador", "entidade", "solicitante"],
  city: ["cidade", "municipio"],
  start_date: ["inicio", "data", "data inicio", "data de inicio", "data do evento"],
  end_date: ["fim", "termino", "data fim", "data final", "data de termino"],
  value: ["valor", "valor (r$)", "valor r$", "investimento"],
  category: ["categoria", "tipo", "segmento"],
  notes: ["observacoes", "observacao", "obs", "notas"],
};

function toISO(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function matchCategory(v: unknown): string | null {
  const n = norm(v);
  if (!n) return null;
  return SPONSORSHIP_CATEGORIES.find((c) => norm(c) === n || (n.length >= 4 && norm(c).startsWith(n.slice(0, 5)))) ?? null;
}

async function parseFile(file: File): Promise<Parsed[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (raw.length === 0) return [];
  const headers = Object.keys(raw[0]);
  const pick = (field: keyof typeof COLUMNS) => headers.find((h) => COLUMNS[field].includes(norm(h)));
  const col = Object.fromEntries((Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).map((k) => [k, pick(k)])) as Record<keyof typeof COLUMNS, string | undefined>;
  if (!col.event_name) throw new Error('A planilha precisa de uma coluna "Evento".');

  return raw
    .map((r): Parsed => {
      const event_name = String(r[col.event_name!] ?? "").trim();
      const valueRaw = col.value ? r[col.value] : 0;
      const value = typeof valueRaw === "number" ? valueRaw : parseMoney(String(valueRaw ?? ""));
      const start = col.start_date ? toISO(r[col.start_date]) : null;
      const end = col.end_date ? toISO(r[col.end_date]) : start;
      const category = matchCategory(col.category ? r[col.category] : "") ?? "Social";
      const p: Parsed = {
        ok: true,
        event_name,
        institution: col.institution ? String(r[col.institution] ?? "").trim() : "",
        city: col.city ? String(r[col.city] ?? "").trim() : "",
        start_date: start,
        end_date: end && start && end < start ? start : end,
        value: Number.isFinite(value) ? value : 0,
        category,
        notes: col.notes ? String(r[col.notes] ?? "").trim() : "",
      };
      if (!event_name) Object.assign(p, { ok: false, problem: "sem nome do evento" });
      else if (!Number.isFinite(value) || value < 0) Object.assign(p, { ok: false, problem: "valor inválido" });
      return p;
    })
    .filter((p) => p.event_name || p.value);
}

export function SponsorshipImport({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const parsed = await parseFile(f);
      setRows(parsed);
      setSelected(new Set(parsed.map((p, i) => (p.ok ? i : -1)).filter((i) => i >= 0)));
      setFileName(f.name);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    let created = 0;
    let duplicated = 0;
    let failed = 0;
    for (const i of [...selected].sort((a, b) => a - b)) {
      const r = rows[i];
      const { error } = await supabase.from("sponsorships").insert({
        event_name: r.event_name, institution: r.institution, city: r.city, start_date: r.start_date, end_date: r.end_date,
        value: r.value, category: r.category, tier: tierFor(r.value), status: "Confirmado", notes: r.notes,
      });
      if (!error) created++;
      else if (error.code === "23505") duplicated++;
      else failed++;
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["sponsorships"] });
    toast.success(
      [`${created} importados`, duplicated ? `${duplicated} já existiam` : "", failed ? `${failed} com erro` : ""].filter(Boolean).join(" · "),
    );
    if (!failed) close();
  }

  function close() {
    setRows(null);
    setSelected(new Set());
    setFileName("");
    onOpenChange(false);
  }

  const total = rows ? [...selected].reduce((s, i) => s + rows[i].value, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar patrocínios de planilha</DialogTitle>
          <DialogDescription>
            Excel (.xlsx) ou CSV com as colunas Evento, Instituição, Cidade, Início, Fim, Valor e Categoria (só Evento é obrigatória). Linhas que já
            existem (mesmo evento, instituição e data) são puladas.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center hover:border-primary/40">
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />}
            <span className="text-sm font-medium">Escolher planilha</span>
            <span className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</span>
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {fileName}: {rows.length} linhas lidas · {selected.size} selecionadas · {brl(total)}
            </p>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Evento</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.ok ? "" : "opacity-60"}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(i)}
                          disabled={!r.ok}
                          onCheckedChange={(v) => {
                            const n = new Set(selected);
                            if (v) n.add(i);
                            else n.delete(i);
                            setSelected(n);
                          }}
                          aria-label={`Importar ${r.event_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.event_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.problem ? `Não importável: ${r.problem}` : r.institution}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.city || "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{fmtDate(r.start_date)}</TableCell>
                      <TableCell className="text-sm">{r.category}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{brl(r.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          {rows && (
            <Button onClick={() => void run()} disabled={busy || selected.size === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {selected.size} patrocínios
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
