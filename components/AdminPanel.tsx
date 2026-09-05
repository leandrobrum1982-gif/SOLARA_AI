"use client";

import { useState, useEffect } from "react";
import styles from "./AdminPanel.module.css";

interface Perfil {
  id: string;
  email: string;
  nome: string;
  papel: string;
  areas: string[];
}

interface AdminPanelProps {
  perfis: Perfil[];
}

export default function AdminPanel({ perfis: perfiisIniciais }: AdminPanelProps) {
  const [perfis, setPerfis] = useState<Perfil[]>(perfiisIniciais);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"operador" | "admin">("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const AREAS_DISPONIVEIS = ["vendas", "financeiro", "rh", "juridico", "operacoes"];

  const handleToggleArea = (area: string) => {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setMensagem("");

    try {
      const response = await fetch("/api/admin/criar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          senha,
          nome,
          papel,
          areas,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMensagem(`Erro: ${data.error}`);
        return;
      }

      setMensagem("Usuário criado com sucesso!");
      setPerfis([...perfis, data.perfil]);
      setEmail("");
      setSenha("");
      setNome("");
      setPapel("operador");
      setAreas([]);
    } catch (err) {
      setMensagem("Erro ao criar usuário. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Administração</h1>
        <a href="/">← Voltar</a>
      </header>

      <div className={styles.content}>
        {/* Tabela de perfis */}
        <section className={styles.secao}>
          <h2>Usuários ({perfis.length})</h2>
          <div className={styles.tabelaWrapper}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Áreas</th>
                </tr>
              </thead>
              <tbody>
                {perfis.map((perfil) => (
                  <tr key={perfil.id}>
                    <td className={styles.email}>{perfil.email}</td>
                    <td>{perfil.nome}</td>
                    <td>
                      <span
                        className={
                          styles.papel +
                          " " +
                          (perfil.papel === "admin" ? styles.admin : styles.operador)
                        }
                      >
                        {perfil.papel}
                      </span>
                    </td>
                    <td>
                      <div className={styles.areas}>
                        {perfil.areas && perfil.areas.length > 0
                          ? perfil.areas.join(", ")
                          : "-"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Formulário de criação */}
        <section className={styles.secao}>
          <h2>Criar Novo Usuário</h2>
          <form onSubmit={handleCriarUsuario} className={styles.form}>
            <div className={styles.grupo}>
              <label>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={carregando}
              />
            </div>

            <div className={styles.grupo}>
              <label>Senha Inicial</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                disabled={carregando}
              />
            </div>

            <div className={styles.grupo}>
              <label>Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                disabled={carregando}
              />
            </div>

            <div className={styles.grupo}>
              <label>Papel</label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value as "operador" | "admin")}
                disabled={carregando}
              >
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className={styles.grupo}>
              <label>Áreas</label>
              <div className={styles.checkboxes}>
                {AREAS_DISPONIVEIS.map((area) => (
                  <label key={area} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={areas.includes(area)}
                      onChange={() => handleToggleArea(area)}
                      disabled={carregando}
                    />
                    <span>{area}</span>
                  </label>
                ))}
              </div>
            </div>

            {mensagem && (
              <div
                className={
                  styles.mensagem +
                  " " +
                  (mensagem.includes("Erro") ? styles.erro : styles.sucesso)
                }
              >
                {mensagem}
              </div>
            )}

            <button type="submit" disabled={carregando} className={styles.botao}>
              {carregando ? "Criando..." : "Criar Usuário"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
