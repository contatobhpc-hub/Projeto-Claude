import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, LayoutGrid, LogOut, Megaphone, Menu, Plus, Search, User as UserIcon } from "lucide-react";

import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, initialsOf } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
import { CommandPalette, useCommandShortcut } from "@/components/command-palette";
import { QuickCreateProvider, useQuickCreate } from "@/components/quick-create";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/lib/permissions";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <QuickCreateProvider>
        <ShellLayout>{children}</ShellLayout>
      </QuickCreateProvider>
    </SidebarProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { profile } = usePermissions();
  const displayName = profile?.full_name || profile?.email || "Usuário";
  const [searchOpen, setSearchOpen] = useState(false);
  useCommandShortcut(setSearchOpen);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border px-3 backdrop-blur-xl [background-color:var(--glass-bg)] sm:gap-3 sm:px-5">
          <SidebarTrigger className="hidden text-muted-foreground hover:text-foreground md:inline-flex" aria-label="Recolher ou abrir o menu" />

          {/* Busca global: no celular vira só o ícone */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-11 min-w-0 max-w-xl flex-1 items-center gap-2.5 rounded-xl border border-input bg-surface-elevated px-3.5 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong sm:flex"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Buscar campanha, contrato, parceiro… ou criar</span>
            <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-sans text-[11px]">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
          </button>
          <span className="font-display text-base font-bold text-foreground sm:hidden">Marketing Hub</span>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <Button variant="ghost" size="icon" className="h-10 w-10 sm:hidden" aria-label="Buscar" onClick={() => setSearchOpen(true)}>
              <Search className="h-5 w-5" />
            </Button>
            <CreateButton />
            <NotificationsBell />
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu da conta" className="h-10 w-10 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-brand-dark text-[11px] font-bold text-white">{initialsOf(displayName)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="truncate">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{profile?.email}</div>
                  <div className="mt-1 text-[11px] font-normal text-primary-ink">{profile?.role?.name}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/minha-conta">
                    <UserIcon className="mr-2 h-4 w-4" /> Minha conta
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    window.location.replace("/auth");
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          <div className="stagger mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>

      <MobileNav />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function CreateButton() {
  const { options, open } = useQuickCreate();
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="hidden h-10 rounded-xl px-4 font-semibold sm:inline-flex">
          <Plus className="h-4 w-4" /> Criar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">Criar novo</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.kind} onClick={() => open(o.kind)} className="gap-3 py-2">
            <o.icon className="h-4 w-4 text-primary-ink" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-[11px] text-muted-foreground">{o.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Navegação de baixo no celular: o essencial a um toque, criar no meio. */
function MobileNav() {
  const { setOpenMobile } = useSidebar();
  const { options, open } = useQuickCreate();
  const { can } = usePermissions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const item = "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 backdrop-blur-xl md:hidden">
      <Link to="/" className={`${item} ${active("/") ? "text-primary-ink" : "text-muted-foreground"}`}>
        <LayoutGrid className="h-5 w-5" /> Painel
      </Link>
      {can("campanhas", "view") && (
        <Link to="/campanhas" className={`${item} ${active("/campanhas") ? "text-primary-ink" : "text-muted-foreground"}`}>
          <Megaphone className="h-5 w-5" /> Campanhas
        </Link>
      )}
      {options.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Criar" className="flex flex-1 items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-md)]">
                <Plus className="h-6 w-6" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-64">
            {options.map((o) => (
              <DropdownMenuItem key={o.kind} onClick={() => open(o.kind)} className="gap-3 py-2.5">
                <o.icon className="h-4 w-4 text-primary-ink" /> {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {can("calendario", "view") && (
        <Link to="/calendario" className={`${item} ${active("/calendario") ? "text-primary-ink" : "text-muted-foreground"}`}>
          <CalendarDays className="h-5 w-5" /> Agenda
        </Link>
      )}
      <button type="button" onClick={() => setOpenMobile(true)} className={`${item} text-muted-foreground`}>
        <Menu className="h-5 w-5" /> Mais
      </button>
    </nav>
  );
}
