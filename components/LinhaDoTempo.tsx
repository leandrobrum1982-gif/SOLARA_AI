"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./LinhaDoTempo.module.css";

interface Execucao {
  id: string;
  agente: string;
  status: string;
  inicio: string;
  fim?: string;
  tokens_entrada?: number;
  tokens_saida?: number;
  entrada?: unknown;
  saida?: unknown;
  erro?: string;
}

interface LinhaDoTempoProps {
  item_id: string;
}

export default function LinhaDoTempo({ item_id }: LinhaDoTempoProps) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const supabase = createClient();

    const carregar = async () => {
      const { data } = await supabase
        .from("execucoes_agentes")
        .select("*")
        .eq("item_id", item_id)
        .order("inicio", { ascending: true });

      if (data) {
        setExecucoes(data);
      }
    };

    carregar();

    const subscription = supabase
      .channel(`execucoes:${item_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${item_id}`,
        },
        () => {
          carregar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [item_id]);

  const getTempo = (exec: Execucao) => {
    if (!exec.fim) return "-";
    const ms = new Date(exec.fim).getTime() - new Date(exec.inicio).getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusCor = (status: string) => {
    if (status === "ok") return "#27ae60";
    if (status === "erro") return "#e74c3c";
    if (status === "rodando") return "#3498db";
    return "#999";
  };

  return (
    <div className={styles.container}>
      <h4>Linha do Tempo</h4>
      {execucoes.length === 0 ? (
        <p className={styles.vazio}>Nenhuma execução</p>
      ) : (
        <div className={styles.lista}>
          {execucoes.map((exec, idx) => (
            <div key={exec.id} className={styles.item}>
              <div
                className={styles.cabecalho}
                onClick={() =>
                  setExpandido((prev) => ({
                    ...prev,
                    [exec.id]: !prev[exec.id],
                  }))
                }
              >
                <div className={styles.indice}>{idx + 1}</div>
                <div
                  className={styles.status}
                  style={{ background: getStatusCor(exec.status) }}
                >
                  {exec.status}
                </div>
                <div className={styles.agente}>{exec.agente}</div>
                <div className={styles.tempo}>{getTempo(exec)}</div>
                <div className={styles.tokens}>
                  {exec.tokens_entrada && exec.tokens_saida
                    ? `${exec.tokens_entrada + exec.tokens_saida} tok`
                    : "-"}
                </div>
                <div className={styles.expandir}>
                  {expandido[exec.id] ? "▼" : "▶"}
                </div>
              </div>

              {expandido[exec.id] && (
                <div className={styles.conteudo}>
                  <div className={styles.secao}>
                    <h5>Entrada</h5>
                    <pre>{JSON.stringify(exec.entrada, null, 2)}</pre>
                  </div>

                  {exec.saida && (
                    <div className={styles.secao}>
                      <h5>Saída</h5>
                      <pre>{JSON.stringify(exec.saida, null, 2)}</pre>
                    </div>
                  )}

                  {exec.erro && (
                    <div className={styles.secao + " " + styles.erro}>
                      <h5>Erro</h5>
                      <pre>{exec.erro}</pre>
                    </div>
                  )}

                  {exec.inicio && (
                    <div className={styles.secao}>
                      <h5>Detalhes</h5>
                      <table className={styles.tabela}>
                        <tbody>
                          <tr>
                            <td>Início:</td>
                            <td>{new Date(exec.inicio).toLocaleString("pt-BR")}</td>
                          </tr>
                          {exec.fim && (
                            <tr>
                              <td>Fim:</td>
                              <td>{new Date(exec.fim).toLocaleString("pt-BR")}</td>
                            </tr>
                          )}
                          <tr>
                            <td>Tokens entrada:</td>
                            <td>{exec.tokens_entrada || 0}</td>
                          </tr>
                          <tr>
                            <td>Tokens saída:</td>
                            <td>{exec.tokens_saida || 0}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
