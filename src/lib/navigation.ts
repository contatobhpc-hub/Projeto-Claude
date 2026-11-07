import {
  LayoutDashboard,
  AlertTriangle,
  Megaphone,
  FolderKanban,
  Trello,
  Calendar,
  FileText,
  Handshake,
  ScrollText,
  CalendarHeart,
  Sparkles,
  Radio,
  Gift,
  Wallet,
  ShoppingCart,
  BarChart3,
  Gauge,
  Workflow,
  Bot,
  Bell,
  Target,
  Users,
  ShieldCheck,
  History,
  Trash2,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "@/lib/permissions";

export type NavItem = {
  title: string;
  to: string;
  icon: LucideIcon;
  module: ModuleKey;
  /** Fase em que a tela entra no novo app. Telas de fases futuras aparecem como "em breve". */
  phase: 1 | 2 | 3 | 4 | 5;
};

export type NavGroup = { label: string; items: NavItem[] };

/** Fase atualmente entregue. Itens de fases posteriores ficam desabilitados no menu. */
export const CURRENT_PHASE = 2;

export const navGroups: NavGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", to: "/", icon: LayoutDashboard, module: "dashboard", phase: 1 },
      { title: "Central de Prioridades", to: "/prioridades", icon: AlertTriangle, module: "prioridades", phase: 5 },
      { title: "Notificações", to: "/notificacoes", icon: Bell, module: "notificacoes", phase: 5 },
    ],
  },
  {
    label: "Estratégia",
    items: [
      { title: "Planejamento Estratégico", to: "/planejamento", icon: Target, module: "planejamento", phase: 5 },
      { title: "Indicadores", to: "/indicadores", icon: Gauge, module: "indicadores", phase: 5 },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Campanhas", to: "/campanhas", icon: Megaphone, module: "campanhas", phase: 2 },
      { title: "Projetos", to: "/projetos", icon: FolderKanban, module: "projetos", phase: 2 },
      { title: "Kanban", to: "/kanban", icon: Trello, module: "kanban", phase: 2 },
      { title: "Calendário", to: "/calendario", icon: Calendar, module: "calendario", phase: 2 },
      { title: "Conteúdos", to: "/conteudos", icon: FileText, module: "conteudos", phase: 2 },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { title: "Parceiros", to: "/parceiros", icon: Handshake, module: "parceiros", phase: 3 },
      { title: "Contratos", to: "/contratos", icon: ScrollText, module: "contratos", phase: 3 },
      { title: "Eventos", to: "/eventos", icon: CalendarHeart, module: "eventos", phase: 3 },
      { title: "Patrocínios", to: "/patrocinios", icon: Sparkles, module: "patrocinios", phase: 3 },
    ],
  },
  {
    label: "Mídia & Materiais",
    items: [
      { title: "Mídia Offline", to: "/midia-offline", icon: Radio, module: "midia", phase: 3 },
      { title: "Brindes", to: "/brindes", icon: Gift, module: "brindes", phase: 3 },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Orçamento e pagamentos", to: "/financeiro", icon: Wallet, module: "fin_orcamento", phase: 4 },
      { title: "Solicitações de compra", to: "/compras", icon: ShoppingCart, module: "fin_compras", phase: 4 },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { title: "Central IA", to: "/central-ia", icon: Bot, module: "ia", phase: 5 },
      { title: "Analytics", to: "/analytics", icon: BarChart3, module: "analytics", phase: 5 },
      { title: "Workflows", to: "/workflows", icon: Workflow, module: "workflows", phase: 5 },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Usuários", to: "/admin/usuarios", icon: Users, module: "admin", phase: 1 },
      { title: "Cargos e permissões", to: "/admin/cargos", icon: ShieldCheck, module: "admin", phase: 1 },
      { title: "Histórico de alterações", to: "/admin/historico", icon: History, module: "admin", phase: 1 },
      { title: "Lixeira", to: "/admin/lixeira", icon: Trash2, module: "admin", phase: 1 },
      { title: "Configurações", to: "/admin/configuracoes", icon: Settings, module: "admin", phase: 1 },
    ],
  },
];
