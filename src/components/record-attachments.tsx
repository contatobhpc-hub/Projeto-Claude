import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBytes, useAttachmentActions, useAttachments, MAX_FILE_MB } from "@/lib/attachments";
import { usePermissions, type ModuleKey } from "@/lib/permissions";
import { errorMessage } from "@/lib/errors";

/**
 * Lista de anexos de um registro, com envio e remoção.
 * Uso: <RecordAttachments module="campanhas" recordId={campaign.id} />
 */
export function RecordAttachments({
  module,
  recordId,
  canAttach,
}: {
  module: ModuleKey;
  recordId: string;
  /** Sobrescreve a regra padrão (criar ou editar no módulo). Útil para escopo "só atribuídos". */
  canAttach?: boolean;
}) {
  const { can, profile } = usePermissions();
  const { data: files = [], isLoading } = useAttachments(module, recordId);
  const { upload, remove, openUrl } = useAttachmentActions(module, recordId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const allowed = canAttach ?? (can(module, "create") || can(module, "edit"));

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(list)) {
      try {
        await upload(f);
        ok++;
      } catch (err) {
        toast.error(`${f.name}: ${errorMessage(err)}`);
      }
    }
    setBusy(false);
    if (ok) toast.success(ok === 1 ? "Arquivo anexado." : `${ok} arquivos anexados.`);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Anexos</h3>
        {allowed && (
          <>
            <input ref={input} type="file" multiple hidden onChange={(e) => void onPick(e.target.files)} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              Anexar
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum arquivo. {allowed && `Até ${MAX_FILE_MB} MB por arquivo.`}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{a.file_name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Baixar ${a.file_name}`}
                onClick={async () => {
                  try {
                    window.open(await openUrl(a), "_blank", "noopener");
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              {(can(module, "delete") || a.created_by === profile?.id) && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover ${a.file_name}`}
                  className="text-destructive"
                  onClick={async () => {
                    if (!window.confirm(`Remover "${a.file_name}"?`)) return;
                    try {
                      await remove(a);
                      toast.success("Anexo removido.");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
