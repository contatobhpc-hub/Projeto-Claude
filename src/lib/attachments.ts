// Anexos de qualquer registro de qualquer módulo.
// O arquivo vai para o Storage (bucket privado "attachments") e os dados dele
// para a tabela attachments. Acesso controlado pelas permissões do módulo.

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AttachmentRow } from "@/integrations/supabase/types";
import type { ModuleKey } from "@/lib/permissions";

const BUCKET = "attachments";
export const MAX_FILE_MB = 25;

const key = (module: ModuleKey, recordId: string) => ["attachments", module, recordId] as const;

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

export function useAttachments(module: ModuleKey, recordId: string | undefined) {
  return useQuery({
    queryKey: key(module, recordId ?? ""),
    enabled: !!recordId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*")
        .eq("module", module)
        .eq("record_id", recordId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttachmentRow[];
    },
  });
}

export function useAttachmentActions(module: ModuleKey, recordId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: key(module, recordId) });

  async function upload(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      throw new Error(`O arquivo passa de ${MAX_FILE_MB} MB.`);
    }
    const path = `${module}/${recordId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw up.error;
    const { error } = await supabase.from("attachments").insert({
      module,
      record_id: recordId,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: path,
    });
    if (error) {
      // Não deixa arquivo órfão no Storage se o registro falhar
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    await invalidate();
  }

  async function remove(a: AttachmentRow) {
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    await invalidate();
  }

  async function openUrl(a: AttachmentRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 60, {
      download: a.file_name,
    });
    if (error) throw error;
    return data.signedUrl;
  }

  return { upload, remove, openUrl };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
