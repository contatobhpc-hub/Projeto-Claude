import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { usePermissions } from "@/lib/permissions";
import { useProfiles } from "@/lib/team";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="dashboard">
      <Dashboard />
    </ModuleGuard>
  ),
});

const PHASES = [
  { n: 1, title: "Fundação", body: "Login, usuários, cargos, permissões, histórico, lixeira e anexos." },
  { n: 2, title: "Operação", body: "Campanhas, Projetos, Kanban, Calendário e Conteúdos." },
  { n: 3, title: "Relacionamento e materiais", body: "Parceiros, Contratos, Eventos, Patrocínios, Mídia Offline e Brindes." },
  { n: 4, title: "Financeiro e aprovações", body: "Orçamento, despesas, compras, notas, pagamentos e aprovações." },
  { n: 5, title: "Inteligência", body: "Dashboard completo, Prioridades, Notificações, Planejamento, Indicadores, Workflows e Central IA." },
];

function Dashboard() {
  const { profile, isAdmin } = usePermissions();
  const firstName = (profile?.full_name || "").split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Olá"}
        description={`Você está como ${profile?.role?.name ?? "—"}. Os módulos aparecem no menu conforme seu cargo e a fase de entrega.`}
      />

      {isAdmin && <PendingUsersCard />}

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold">Fases do novo Marketing Hub</h2>
        <ol className="mt-4 space-y-3">
          {PHASES.map((p) => {
            const done = p.n <= 1;
            return (
              <li key={p.n} className="flex gap-3">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">
                    Fase {p.n} · {p.title}
                    {done && <span className="ml-2 text-xs font-normal text-primary">disponível</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{p.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function PendingUsersCard() {
  const { data: profiles } = useProfiles();
  const pending = (profiles ?? []).filter((p) => !p.active);
  if (pending.length === 0) return null;
  return (
    <Link
      to="/admin/usuarios"
      className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/8 p-5 transition-colors hover:bg-primary/12"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <UserPlus className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold">
          {pending.length === 1 ? "1 cadastro aguardando liberação" : `${pending.length} cadastros aguardando liberação`}
        </div>
        <div className="text-sm text-muted-foreground">Abra Usuários para definir cargo e liberar o acesso.</div>
      </div>
    </Link>
  );
}
