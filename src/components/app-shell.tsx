import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, User as UserIcon } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, initialsOf } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
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
  const { signOut } = useAuth();
  const { profile } = usePermissions();
  const displayName = profile?.full_name || profile?.email || "Usuário";

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full" style={{ backgroundImage: "var(--gradient-mesh)" }}>
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 px-4 backdrop-blur-2xl [background-color:var(--glass-bg)]">
            <SidebarTrigger className="press text-muted-foreground transition-colors hover:text-foreground" />

            <div className="ml-auto flex items-center gap-1.5">
              <NotificationsBell />
              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Menu da conta"
                    className="press h-10 w-10 rounded-full ring-1 ring-border hover:ring-primary/50"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                        {initialsOf(displayName)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="truncate">
                    <div className="text-sm font-medium">{displayName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{profile?.email}</div>
                    <div className="mt-1 text-[11px] font-normal text-primary">{profile?.role?.name}</div>
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

          <main className="flex-1 overflow-auto">
            <div className="stagger mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
