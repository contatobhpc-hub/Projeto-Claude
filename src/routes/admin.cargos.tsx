import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Plus, Trash2, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { RolePermissionRow, RoleRow } from "@/integrations/supabase/types";
import { teamKeys, useModules, useProfiles, useRolePermissions, useRoles } from "@/lib/team";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/admin/cargos")({
  head: () => ({ meta: [{ title: "Cargos e permissões — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <RolesPage />
    </ModuleGuard>
  ),
});

type Flag = "can_view" | "can_create" | "can_edit" | "can_delete" | "can_approve";
const FLAGS: { key: Flag; label: string }[] = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Criar" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Excluir" },
  { key: "can_approve", label: "Aprovar" },
];

const EMPTY = { can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false, scope: "all" as const };

function RolesPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: modules = [] } = useModules();
  const { data: perms = [] } = useRolePermissions();
  const { data: profiles = [] } = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const isAdminRole = selected?.key === "admin";
  const peopleIn = (roleId: string) => profiles.filter((p) => p.role_id === roleId && p.active).length;

  const permOf = useMemo(() => {
    const m = new Map(perms.filter((p) => p.role_id === selected?.id).map((p) => [p.module, p]));
    return (module: string) => m.get(module) ?? { ...EMPTY, role_id: selected?.id ?? "", module };
  }, [perms, selected?.id]);

  const groups = useMemo(() => {
    const out: { label: string; items: typeof modules }[] = [];
    for (const m of modules) {
      const g = out.find((x) => x.label === m.group_label);
      if (g) g.items.push(m);
      else out.push({ label: m.group_label, items: [m] });
    }
    return out;
  }, [modules]);

  async function save(next: RolePermissionRow) {
    const prev = qc.getQueryData<RolePermissionRow[]>(teamKeys.rolePermissions);
    qc.setQueryData<RolePermissionRow[]>(teamKeys.rolePermissions, (old = []) => {
      const rest = old.filter((p) => !(p.role_id === next.role_id && p.module === next.module));
      return [...rest, next];
    });
    const { error } = await supabase.from("role_permissions").upsert(next, { onConflict: "role_id,module" });
    if (error) {
      qc.setQueryData(teamKeys.rolePermissions, prev);
      toast.error(errorMessage(error));
    }
  }

  function toggle(module: string, flag: Flag, value: boolean) {
    const cur = permOf(module);
    const next: RolePermissionRow = { ...cur, role_id: selected!.id, module, [flag]: value };
    // Coerência: qualquer ação exige "Ver"; tirar "Ver" tira tudo.
    if (flag === "can_view" && !value) {
      next.can_create = next.can_edit = next.can_delete = next.can_approve = false;
      next.scope = "all";
    }
    if (flag !== "can_view" && value) next.can_view = true;
    void save(next);
  }

  function toggleScope(module: string, own: boolean) {
    const cur = permOf(module);
    const next: RolePermissionRow = { ...cur, role_id: selected!.id, module, scope: own ? "own" : "all" };
    if (own) {
      next.can_view = true;
      next.can_edit = true;
    } else {
      // Sair de "só atribuídos" não pode virar edição total sem querer.
      next.can_edit = false;
      next.can_delete = false;
    }
    void save(next);
  }

  return (
    <>
      <PageHeader
        title="Cargos e permissões"
        description="Defina o que cada cargo pode fazer em cada módulo. As regras valem no banco de dados, não só na tela, e mudam na hora para quem estiver usando o app."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo cargo
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1.5">
          {roles.map((r) => {
            const active = r.id === selected?.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-surface-elevated"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {peopleIn(r.id)}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</div>
              </button>
            );
          })}
        </nav>

        {selected && (
          <section className="min-w-0 rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 className="font-display text-base font-semibold">{selected.name}</h2>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              </div>
              {!selected.is_system && (
                <Button variant="outline" size="sm" onClick={() => setDeleting(selected)}>
                  <Trash2 className="h-4 w-4" /> Excluir cargo
                </Button>
              )}
            </div>

            {isAdminRole ? (
              <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" />
                O Administrador sempre tem acesso total, para que ninguém perca o controle da plataforma.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">Módulo</TableHead>
                      {FLAGS.map((f) => (
                        <TableHead key={f.key} className="w-[70px] text-center">
                          {f.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-[110px] text-center" title="Ver tudo, mas editar só o que estiver atribuído à pessoa">
                        Só atribuídos
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => (
                      <Fragment key={g.label}>
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/40 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {g.label}
                          </TableCell>
                        </TableRow>
                        {g.items.map((m) => {
                          const p = permOf(m.key);
                          const own = p.scope === "own";
                          return (
                            <TableRow key={m.key}>
                              <TableCell className="text-sm">{m.label}</TableCell>
                              {FLAGS.map((f) => {
                                const disabled = own && (f.key === "can_edit" || f.key === "can_delete");
                                return (
                                  <TableCell key={f.key} className="text-center">
                                    <Checkbox
                                      checked={p[f.key]}
                                      disabled={disabled}
                                      aria-label={`${f.label} em ${m.label}`}
                                      onCheckedChange={(v) => toggle(m.key, f.key, v === true)}
                                    />
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={own}
                                  aria-label={`Editar só atribuídos em ${m.label}`}
                                  onCheckedChange={(v) => toggleScope(m.key, v === true)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}
      </div>

      <NewRoleDialog open={creating} onOpenChange={setCreating} onCreated={(id) => setSelectedId(id)} nextOrder={(roles.at(-1)?.sort_order ?? 0) + 10} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o cargo {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && profiles.some((p) => p.role_id === deleting.id)
                ? "Ainda há pessoas com este cargo. Mude o cargo delas em Usuários antes de excluir."
                : "As permissões deste cargo serão apagadas. Esta ação fica registrada no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deleting && profiles.some((p) => p.role_id === deleting.id)}
              onClick={async () => {
                if (!deleting) return;
                const { error } = await supabase.from("roles").delete().eq("id", deleting.id);
                if (error) toast.error(errorMessage(error));
                else {
                  toast.success("Cargo excluído.");
                  setSelectedId(null);
                  void qc.invalidateQueries({ queryKey: teamKeys.roles });
                  void qc.invalidateQueries({ queryKey: teamKeys.rolePermissions });
                }
                setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NewRoleDialog({
  open,
  onOpenChange,
  onCreated,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
  nextOrder: number;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const key =
      name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "cargo";
    const { data, error } = await supabase
      .from("roles")
      .insert({ key: `${key}_${Date.now().toString(36)}`, name: name.trim(), description: description.trim(), sort_order: nextOrder })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Cargo criado. Agora marque as permissões dele.");
    await qc.invalidateQueries({ queryKey: teamKeys.roles });
    onCreated(data.id);
    setName("");
    setDescription("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Novo cargo</DialogTitle>
            <DialogDescription>O cargo nasce sem permissões; você marca o que ele pode fazer em seguida.</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rn">Nome</Label>
              <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Agência parceira" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd">Descrição</Label>
              <Textarea id="rd" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Criar cargo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
