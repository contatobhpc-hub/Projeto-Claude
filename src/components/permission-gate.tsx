import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Loader2 } from "lucide-react";

import { usePermissions, type Action, type ModuleKey } from "@/lib/permissions";

/** Mostra o conteúdo só quando o cargo do usuário tem a permissão. */
export function Can({
  module,
  action,
  children,
  fallback = null,
}: {
  module: ModuleKey;
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = usePermissions();
  return <>{can(module, action) ? children : fallback}</>;
}

/** Protege uma tela inteira: sem permissão de visualizar, mostra aviso em vez do conteúdo. */
export function ModuleGuard({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { can, loading } = usePermissions();
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!can(module, "view")) return <NoAccess />;
  return <>{children}</>;
}

export function NoAccess() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="font-display text-base font-semibold">Sem acesso a esta área</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu cargo não inclui esta tela. Se precisar dela, fale com um Administrador.
      </p>
      <Link to="/" className="mt-5 inline-block text-sm font-medium text-primary-ink hover:underline">
        Voltar ao início
      </Link>
    </div>
  );
}
