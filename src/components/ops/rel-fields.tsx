// Seletores dos módulos de Relacionamento (parceiros, eventos, contratos, listas configuráveis).

import type { ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useContracts, useMktEvents, usePartners, withCurrent } from "@/lib/relacionamento";

const NONE = "__none__";

function NullableSelect({
  value,
  onChange,
  disabled,
  placeholder,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder: string;
  options: { id: string; label: string }[];
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PartnerSelect(props: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data = [] } = usePartners();
  return <NullableSelect {...props} placeholder="Sem parceiro" options={data.map((p) => ({ id: p.id, label: p.company }))} />;
}

export function MktEventSelect(props: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data = [] } = useMktEvents();
  return <NullableSelect {...props} placeholder="Sem evento" options={data.map((e) => ({ id: e.id, label: e.name }))} />;
}

export function ContractSelect(props: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data = [] } = useContracts();
  return (
    <NullableSelect
      {...props}
      placeholder="Sem contrato"
      options={data.map((c) => ({ id: c.id, label: c.company ? `${c.object} — ${c.company}` : c.object }))}
    />
  );
}

/** Categoria vinda das listas configuráveis (mantém o valor atual mesmo se saiu da lista). */
export function ListSelect({
  value,
  list,
  onChange,
  disabled,
  className,
}: {
  value: string;
  list: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {withCurrent(list, value).map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Vários valores de uma lista (ex.: categorias de mídia). */
export function MultiChips({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
              on ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-seleção de parceiros (para eventos). */
export function PartnersPicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { data = [] } = usePartners();
  if (data.length === 0) return <span className="text-xs text-muted-foreground">Nenhum parceiro cadastrado.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {data.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
              on ? "border-primary/50 bg-primary/12 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {p.company}
          </button>
        );
      })}
    </div>
  );
}

export function AlertPill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", tone)}>{children}</span>;
}
