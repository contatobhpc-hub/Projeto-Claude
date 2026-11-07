// Janela padrão de cadastro: aba "Dados" com o formulário + abas extras
// (checklist, arquivos, comentários, histórico…), botões Salvar e Excluir.

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteRecordButton } from "@/components/ops/record-panels";
import type { LiveTable } from "@/lib/data";

export type ExtraTab = { value: string; label: string; content: ReactNode };

export function EntityDialog({
  open,
  onOpenChange,
  title,
  description,
  formId,
  form,
  isNew,
  readOnly,
  busy,
  submitLabel,
  tabs = [],
  remove,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  /** id do <form> dentro de `form`, para o botão Salvar. */
  formId: string;
  form: ReactNode;
  isNew: boolean;
  readOnly?: boolean;
  busy?: boolean;
  submitLabel?: string;
  /** Abas extras, mostradas só para registros já existentes. */
  tabs?: ExtraTab[];
  /** Exclusão (lixeira); omitir quando o cargo não pode excluir. */
  remove?: { table: LiveTable; id: string; label: string };
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${wide ? "max-w-3xl" : "max-w-2xl"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {isNew || tabs.length === 0 ? (
          form
        ) : (
          <Tabs defaultValue="dados">
            <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="dados" forceMount className="data-[state=inactive]:hidden">
              {form}
            </TabsContent>
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value}>
                {t.content}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>{!isNew && remove && <DeleteRecordButton table={remove.table} id={remove.id} label={remove.label} onDeleted={() => onOpenChange(false)} />}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button type="submit" form={formId} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitLabel ?? (isNew ? "Criar" : "Salvar")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Estado de formulário simples com "set(campo, valor)". */
export function useDraftSetter<T>(setD: (fn: (x: T) => T) => void) {
  return <K extends keyof T>(k: K, v: T[K]) => setD((x) => ({ ...x, [k]: v }));
}
