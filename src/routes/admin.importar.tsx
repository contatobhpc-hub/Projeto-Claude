import { createFileRoute } from "@tanstack/react-router";
import { useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errors";
import { buildPlan, runPlan, type ImportPlan } from "@/lib/legacy-import";
import { useAppSettings } from "@/lib/relacionamento";
import { useCostCenters } from "@/lib/financeiro";
import { useProfiles } from "@/lib/team";

export const Route = createFileRoute("/admin/importar")({
  head: () => ({ meta: [{ title: "Importar dados — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <ImportPage />
    </ModuleGuard>
  ),
});

type LastImport = { at: string; file: string; total: number };

function ImportPage() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: costCenters = [] } = useCostCenters();
  const { data: settings } = useAppSettings();
  const last = settings?.legacy_import as LastImport | undefined;

  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<{ label: string; sent: number; inserted: number }[] | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResults(null);
    try {
      const json = JSON.parse(await file.text());
      const p = buildPlan(json, profiles, costCenters);
      if (p.tables.length === 0) return void toast.error("Não achei dados do app antigo neste arquivo. Use o backup gerado em Configurações → Backup.");
      setFileName(file.name);
      setPlan(p);
    } catch {
      toast.error("Arquivo inválido: escolha o .json de backup do app antigo.");
    }
  }

  async function run() {
    if (!plan) return;
    if (last && !window.confirm(`Já houve uma importação em ${format(new Date(last.at), "dd/MM/yyyy HH:mm", { locale: ptBR })}. Importar de novo duplica os registros. Continuar mesmo assim?`)) return;
    setRunning(true);
    try {
      const res = await runPlan(plan, (label, done, total) => setProgress(`${label}: ${done} de ${total}`));
      setResults(res);
      const total = res.reduce((s, r) => s + r.inserted, 0);
      await supabase.from("app_settings").upsert([{ key: "legacy_import", value: { at: new Date().toISOString(), file: fileName, total } as unknown as Json }]);
      void qc.invalidateQueries();
      setPlan(null);
      toast.success(`${total.toLocaleString("pt-BR")} registros importados.`);
    } catch (err) {
      toast.error(`A importação parou em ${errorMessage(err)}. O que já foi gravado continua salvo.`);
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  const totalRows = plan?.tables.reduce((s, t) => s + t.rows.length, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Importar dados do app antigo"
        description="Traz campanhas, projetos, tarefas, calendário, conteúdos, parceiros, contratos, eventos, patrocínios, mídia, brindes, financeiro e planejamento a partir do backup do app antigo."
      />

      <div className="max-w-3xl space-y-4">
        <ol className="list-decimal space-y-1 rounded-2xl border border-border bg-card p-5 pl-9 text-sm">
          <li>No app antigo, abra <strong>Configurações → Backup</strong> e baixe o backup completo (.json).</li>
          <li>Antes de importar, cadastre aqui os usuários da equipe: os responsáveis são ligados pelo nome ou e-mail.</li>
          <li>Escolha o arquivo abaixo, confira a prévia e confirme. Faça isso uma única vez.</li>
        </ol>

        {last && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Última importação em {format(new Date(last.at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} ({last.file}, {last.total.toLocaleString("pt-BR")} registros). Importar de novo cria registros repetidos.
            </span>
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground hover:bg-muted/30">
          <FileUp className="h-5 w-5" />
          {fileName ? `Arquivo: ${fileName} (escolher outro)` : "Escolher o arquivo de backup (.json)"}
          <Input type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e)} disabled={running} />
        </label>

        {plan && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Prévia: {totalRows.toLocaleString("pt-BR")} registros</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>O que será criado</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.tables.map((t) => (
                  <TableRow key={t.table}>
                    <TableCell>{t.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.rows.length.toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {plan.warnings.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {plan.warnings.map((w) => (
                  <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Status, datas e valores originais são mantidos. Nada é aprovado, pago ou notificado automaticamente durante a importação.</p>
            <div className="flex items-center gap-3">
              <Button onClick={() => void run()} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar agora
              </Button>
              {running && <span className="text-sm text-muted-foreground">{progress}</span>}
            </div>
          </section>
        )}

        {results && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" /> Importação concluída</h2>
            <ul className="text-sm">
              {results.map((r) => (
                <li key={r.label} className="flex justify-between border-b border-border py-1 last:border-0">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">{r.inserted.toLocaleString("pt-BR")}{r.inserted < r.sent ? ` de ${r.sent} (o restante já existia)` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
