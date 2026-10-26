import { useState, type FormEvent } from "react";
import { supabase } from "../../data/client";
import { Brand } from "../shared/Brand";
export function Login({ recovery = false }: { recovery?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!supabase)
        throw new Error(
          "Configure as variáveis do Supabase para acessar sua base.",
        );
      const { error } = recovery
        ? await supabase.auth.updateUser({ password })
        : reset
          ? await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin,
            })
          : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (reset)
        setMessage(
          "Se houver uma conta, você receberá as instruções por e-mail.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível acessar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <h1>
          Seu time.
          <br />
          Seu tempo.
          <br />
          <em>Tudo mais claro.</em>
        </h1>
        <p>
          Das batidas do dia à visão do mês.
          <br />
          Um lugar para acompanhar cada jornada.
        </p>
        <small>Organização que acompanha sua operação.</small>
      </section>
      <section className="login-form">
        <span className="eyebrow">BEM-VINDO AO COMPASSO</span>
        <h2>
          {recovery
            ? "Defina sua senha"
            : reset
              ? "Recuperar acesso"
              : "Vamos começar?"}
        </h2>
        <p>Acesse a base compartilhada da sua equipe.</p>
        <form onSubmit={submit}>
          {!recovery && (
            <label>
              E-mail
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
              />
            </label>
          )}
          {(!reset || recovery) && (
            <label>
              Senha
              <input
                required
                minLength={8}
                type="password"
                autoComplete={recovery ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Aguarde…"
              : recovery
                ? "Salvar senha"
                : reset
                  ? "Enviar instruções"
                  : "Entrar na minha conta →"}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
        {!recovery && (
          <button className="text-button" onClick={() => setReset(!reset)}>
            {reset ? "Voltar ao login" : "Esqueci minha senha"}
          </button>
        )}
      </section>
    </main>
  );
}
