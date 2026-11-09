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
      className="border-r-0"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            <img src="/favicon.png" alt="Logo Sicoob Credibelo" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-[15px] font-bold text-white">Marketing Hub</span>
              <span className="truncate text-[11px] text-sidebar-foreground/70">Sicoob Credibelo</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            {!collapsed && (
              <SidebarGroupLabel className="px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/55">
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
                          className="group/nav relative h-10 overflow-hidden rounded-[10px] text-[13.5px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/8 hover:text-white data-[active=true]:bg-[#00ae9d]/20 data-[active=true]:font-semibold data-[active=true]:text-white"
                        >
                          <Link to={item.to}>
                            <span
                              className={`absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r bg-brand-lime transition-all duration-300 ${
                                active ? "h-6 opacity-100" : "h-0 opacity-0"
                              }`}
                            />
                            <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#4fd1c2]" : "opacity-80"}`} strokeWidth={1.75} />
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initialsOf(profile?.full_name || profile?.email || "")}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-white">{profile?.full_name || profile?.email}</span>
              <span className="truncate text-[11px] text-sidebar-foreground/70">{profile?.role?.name ?? "Sem cargo"}</span>
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
