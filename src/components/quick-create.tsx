// "+ Criar" de qualquer tela: abre o formulário certo sem sair da página.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CalendarPlus, FolderPlus, Handshake, ListPlus, Megaphone, ScrollText, ShoppingCart, Sparkles, type LucideIcon } from "lucide-react";

import { CampaignDialog } from "@/components/ops/campaign-dialog";
import { ProjectDialog } from "@/components/ops/project-dialog";
import { TaskDialog } from "@/components/ops/task-dialog";
import { EventDialog } from "@/components/ops/event-dialog";
import { ContractDialog, PartnerDialog } from "@/components/ops/rel-dialogs";
import { SponsorshipDialog } from "@/components/ops/materials-dialogs";
import { PurchaseDialog } from "@/components/ops/finance-dialogs";
import { usePermissions, type ModuleKey } from "@/lib/permissions";

export type CreateKind = "tarefa" | "campanha" | "projeto" | "agenda" | "contrato" | "parceiro" | "patrocinio" | "compra";

export const CREATE_OPTIONS: { kind: CreateKind; label: string; hint: string; icon: LucideIcon; module: ModuleKey }[] = [
  { kind: "tarefa", label: "Tarefa", hint: "Entra no Kanban", icon: ListPlus, module: "kanban" },
  { kind: "campanha", label: "Campanha", hint: "Com período e orçamento", icon: Megaphone, module: "campanhas" },
  { kind: "projeto", label: "Projeto", hint: "Entregas de uma área", icon: FolderPlus, module: "projetos" },
  { kind: "agenda", label: "Compromisso na agenda", hint: "Reunião, prazo, publicação", icon: CalendarPlus, module: "calendario" },
  { kind: "contrato", label: "Contrato", hint: "Com vigência e alertas", icon: ScrollText, module: "contratos" },
  { kind: "parceiro", label: "Parceiro ou fornecedor", hint: "Contato e contrapartidas", icon: Handshake, module: "parceiros" },
  { kind: "patrocinio", label: "Patrocínio", hint: "Evento, cota e prazos", icon: Sparkles, module: "patrocinios" },
  { kind: "compra", label: "Solicitação de compra", hint: "Vai para aprovação", icon: ShoppingCart, module: "fin_compras" },
];

type Ctx = { open: (kind: CreateKind) => void; options: typeof CREATE_OPTIONS };
const QuickCreateContext = createContext<Ctx>({ open: () => {}, options: [] });
export const useQuickCreate = () => useContext(QuickCreateContext);

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const { can } = usePermissions();
  const [kind, setKind] = useState<CreateKind | null>(null);
  // Cada abertura monta o formulário do zero (sem sobras da anterior)
  const [seq, setSeq] = useState(0);
  const options = useMemo(() => CREATE_OPTIONS.filter((o) => can(o.module, "create")), [can]);
  const value = useMemo<Ctx>(
    () => ({
      open: (k) => {
        setSeq((n) => n + 1);
        setKind(k);
      },
      options,
    }),
    [options],
  );
  const close = (o: boolean) => !o && setKind(null);

  return (
    <QuickCreateContext.Provider value={value}>
      {children}
      {kind === "tarefa" && <TaskDialog key={seq} open onOpenChange={close} />}
      {kind === "campanha" && <CampaignDialog key={seq} open onOpenChange={close} />}
      {kind === "projeto" && <ProjectDialog key={seq} open onOpenChange={close} />}
      {kind === "agenda" && <EventDialog key={seq} open onOpenChange={close} />}
      {kind === "contrato" && <ContractDialog key={seq} open onOpenChange={close} />}
      {kind === "parceiro" && <PartnerDialog key={seq} open onOpenChange={close} />}
      {kind === "patrocinio" && <SponsorshipDialog key={seq} open onOpenChange={close} />}
      {kind === "compra" && <PurchaseDialog key={seq} open onOpenChange={close} />}
    </QuickCreateContext.Provider>
  );
}

