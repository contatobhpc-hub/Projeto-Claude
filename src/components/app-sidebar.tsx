import { Link, useRouterState } from "@tanstack/react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { CURRENT_PHASE, navGroups } from "@/lib/navigation";
import { usePermissions } from "@/lib/permissions";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, profile } = usePermissions();

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  // Cada pessoa só vê no menu os módulos que o cargo dela permite.
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.module, "view")) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border [background-image:linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_6%,transparent),transparent_38%)]"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border shadow-[var(--shadow-glow)]">
            <img src="/favicon.png" alt="Logo Sicoob Credibelo" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-sm font-semibold tracking-tight">Marketing Hub</span>
              <span className="truncate text-[11px] tracking-wide text-muted-foreground">Sicoob Credibelo</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            {!collapsed && (
              <SidebarGroupLabel className="eyebrow px-2 text-[10px] text-muted-foreground/60">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const ready = item.phase <= CURRENT_PHASE;
                  const active = ready && isActive(item.to);
                  const label = ready ? item.title : `${item.title} · em breve`;
                  return (
                    <SidebarMenuItem key={item.to}>
                      {ready ? (
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="group/nav relative h-9 overflow-hidden rounded-lg text-[13px] font-medium text-sidebar-foreground/75 transition-all duration-300 [transition-timing-function:var(--ease-premium)] hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-primary/12 data-[active=true]:text-foreground"
                        >
                          <Link to={item.to}>
                            <span
                              className={`absolute left-0 top-1/2 w-[2px] -translate-y-1/2 rounded-r bg-primary transition-all duration-300 ${
                                active ? "h-5 opacity-100" : "h-0 opacity-0 group-hover/nav:h-3 group-hover/nav:opacity-60"
                              }`}
                            />
                            <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} strokeWidth={1.75} />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          disabled
                          tooltip={label}
                          className="h-9 cursor-not-allowed rounded-lg text-[13px] font-medium text-sidebar-foreground/35"
                        >
                          <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{item.title}</span>
                          <span className="ml-auto rounded-md border border-sidebar-border px-1.5 text-[9px] uppercase tracking-wide">
                            Fase {item.phase}
                          </span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary ring-1 ring-primary/20">
            {initialsOf(profile?.full_name || profile?.email || "")}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-medium">{profile?.full_name || profile?.email}</span>
              <span className="truncate text-[11px] text-muted-foreground">{profile?.role?.name ?? "Sem cargo"}</span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function initialsOf(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "U"
  );
}
