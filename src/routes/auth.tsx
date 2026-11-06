import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Marketing Hub" }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/" });
  }, [session, loading, nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada. Confirme o e-mail, se pedido, e aguarde a liberação de um Administrador.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
        if (error) throw error;
        toast.success("Se o e-mail tiver cadastro, enviamos um link para criar nova senha.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    signin: "Entre com seu e-mail e senha.",
    signup: "Crie sua conta. Um Administrador libera o acesso.",
    forgot: "Informe seu e-mail para receber o link de nova senha.",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" style={{ backgroundImage: "var(--gradient-mesh)" }}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl bg-white object-contain ring-1 ring-border" />
          <div>
            <h1 className="font-display text-xl font-semibold leading-tight">Marketing Hub</h1>
            <p className="text-xs text-muted-foreground">Sicoob Credibelo</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{titles[mode]}</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signup" && <p className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>}
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col items-start gap-1.5 text-xs">
          {mode === "signin" && (
            <>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>
                Esqueci minha senha
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("signup")}>
                Não tenho conta — criar
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("signin")}>
              Voltar para entrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
