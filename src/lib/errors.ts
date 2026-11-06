// Mensagens de erro em português para o que o banco e o Supabase devolvem.

type MaybeError = { message?: string; code?: string; details?: string } | null | undefined;

export function errorMessage(err: unknown): string {
  const e = err as MaybeError;
  const msg = e?.message ?? (typeof err === "string" ? err : "");
  const code = e?.code ?? "";

  if (code === "42501" || /row-level security/i.test(msg)) {
    // Mensagens escritas pelos gatilhos do banco já vêm em português
    if (msg && !/row-level security|permission denied/i.test(msg)) return msg;
    return "Seu cargo não tem permissão para esta ação.";
  }
  if (code === "23505") return "Já existe um registro com esses dados.";
  if (code === "23503") return "Este registro está ligado a outros e não pode ser alterado assim.";
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (/User already registered/i.test(msg)) return "Este e-mail já tem cadastro. Use \"Entrar\".";
  if (/Password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sem conexão com o servidor. Verifique sua internet.";
  return msg || "Algo deu errado. Tente novamente.";
}
