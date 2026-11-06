import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Clock, Loader2, LogOut } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PermissionsProvider, usePermissions } from "@/lib/permissions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">O endereço que você abriu não existe ou foi movido.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente de novo ou volte ao início.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Tentar de novo
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Voltar ao início</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Marketing Hub Sicoob" },
      { name: "description", content: "Gestão integrada das estratégias de marketing do Sicoob Credibelo." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const themeInit = `(function(){try{var t=localStorage.getItem('mhub.theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var r=document.documentElement;if(t==='dark'){r.classList.add('dark');}else{r.classList.remove('dark');}r.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionsProvider>
          <AccessGate>
            <Outlet />
          </AccessGate>
          <Toaster richColors position="top-right" />
        </PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const PUBLIC_ROUTES = new Set(["/auth", "/redefinir-senha"]);

/** Sem login → tela de entrada. Cadastro ainda não aprovado → tela de espera. Senão → app. */
function AccessGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { profile, loading: permsLoading } = usePermissions();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = PUBLIC_ROUTES.has(path);

  useEffect(() => {
    if (!loading && !session && !isPublic) navigate({ to: "/auth", replace: true });
  }, [isPublic, loading, navigate, session]);

  if (isPublic) return <>{children}</>;
  if (loading || (session && permsLoading)) return <FullScreenSpinner />;
  if (!session) return null;
  if (!profile || !profile.active) return <PendingApproval email={profile?.email ?? session.user.email ?? ""} />;

  return <AppShell>{children}</AppShell>;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function PendingApproval({ email }: { email: string }) {
  const { signOut } = useAuth();
  const { refresh } = usePermissions();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-semibold">Cadastro aguardando aprovação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta <strong className="text-foreground">{email}</strong> foi criada. Um Administrador precisa
          liberar o acesso e definir seu cargo. Assim que isso acontecer, esta tela abre o app sozinha.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Verificar de novo
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              window.location.replace("/auth");
            }}
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
