// Campos e selos reutilizados pelos formulários e listas da Operação.

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toneOf, useCampaigns, useProjects } from "@/lib/operacao";
import { useProfiles } from "@/lib/team";

const NONE = "__none__";

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pill({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", toneOf(value), className)}>
      {value}
    </span>
  );
}

export function EnumSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Seleção de pessoa da equipe (só usuários ativos). */
export function PersonSelect({
  value,
  onChange,
  disabled,
  placeholder = "Ninguém",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { data: people = [] } = useProfiles();
  const active = people.filter((p) => p.active || p.id === value);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {active.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.full_name || p.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Seleção de várias pessoas (equipe, participantes). */
export function PeoplePicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { data: people = [] } = useProfiles();
  const active = people.filter((p) => p.active || value.includes(p.id));
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((p) => {
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
            {p.full_name || p.email}
          </button>
        );
      })}
      {active.length === 0 && <span className="text-xs text-muted-foreground">Nenhum usuário ativo.</span>}
    </div>
  );
}

export function CampaignSelect({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data: campaigns = [] } = useCampaigns();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Sem campanha" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem campanha</SelectItem>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectSelect({
  value,
  onChange,
  disabled,
  campaignId,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  /** Se informado, mostra primeiro os projetos desta campanha. */
  campaignId?: string | null;
}) {
  const { data: projects = [] } = useProjects();
  const sorted = campaignId
    ? [...projects].sort((a, b) => Number(b.campaign_id === campaignId) - Number(a.campaign_id === campaignId))
    : projects;
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Sem projeto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem projeto</SelectItem>
        {sorted.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Lista de textos separados por vírgula (produtos, etiquetas). */
export function splitList(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
