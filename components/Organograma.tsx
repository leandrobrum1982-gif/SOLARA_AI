"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./Organograma.module.css";

interface Execucao {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  inicio: string;
  fim?: string;
  tokens_entrada?: number;
  tokens_saida?: number;
  saida?: unknown;
}

interface OrganogramaProps {
  area: string;
  item_id: string;
}

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

export default function Organograma({ area, item_id }: OrganogramaProps) {
  const [execucoes, setExecucoes] = useState<Record<string, Execucao>>({});
  const [rejeitadoAgora, setRejeitadoAgora] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let subscription: any;

    const subscribe = async () => {
      subscription = supabase
        .channel(`execucoes:${item_id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "execucoes_agentes",
            filter: `item_id=eq.${item_id}`,
          },
          (payload: any) => {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const exec = payload.new as Execucao;
              setExecucoes((prev) => ({
                ...prev,
                [exec.agente]: exec,
              }));

              // Se revisor rejeitou, marca por 3s
              if (
                exec.agente === "revisor" &&
                exec.saida &&
                typeof exec.saida === "object" &&
                "aprovado" in exec.saida &&
                !(exec.saida as any).aprovado
              ) {
                setRejeitadoAgora("redator");
                setTimeout(() => setRejeitadoAgora(null), 3000);
              }
            }
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [item_id]);

  if (!item_id) {
    return <div className={styles.vazio}>Selecione um item para ver o organograma</div>;
  }

  const agentes = AGENTES_POR_AREA[area] || [];

  const getStatusClass = (agente: string) => {
    const exec = execucoes[agente];
    if (!exec) return styles.cinza;
    if (exec.status === "rodando") return styles.pulsando;
    if (exec.status === "ok") return styles.ok;
    if (exec.status === "erro") return styles.erro;
    return styles.cinza;
  };

  const getTempo = (agente: string) => {
    const exec = execucoes[agente];
    if (!exec || !exec.fim) return "";
    const ms = new Date(exec.fim).getTime() - new Date(exec.inicio).getTime();
    const segundos = (ms / 1000).toFixed(1);
    return `${segundos}s`;
  };

  const getTokens = (agente: string) => {
    const exec = execucoes[agente];
    if (!exec || exec.status !== "ok") return "";
    return `${(exec.tokens_entrada || 0) + (exec.tokens_saida || 0)} tok`;
  };

  const getInvestigadorInfo = (agente: string) => {
    if (agente !== "investigador") return "";
    const investigacoes = Object.values(execucoes).filter(
      (e) => e.agente === "investigador"
    );
    const rodando = investigacoes.filter((e) => e.status === "rodando").length;
    const concluidos = investigacoes.filter((e) => e.status === "ok").length;
    if (rodando > 0 || concluidos > 0) {
      return `${rodando} rodando / ${concluidos} ✓`;
    }
    return "";
  };

  return (
    <div className={styles.container}>
      <div className={styles.orquestrador}>
        <div className={styles.card + " " + styles.cinza}>
          <div className={styles.nome}>orquestrador</div>
        </div>
      </div>

      <svg className={styles.linhas} width="100%" height="120">
        {agentes.map((agente, idx) => {
          const x = ((idx + 1) / (agentes.length + 1)) * 100;
          const isRejeitado = rejeitadoAgora === agente;
          return (
            <g key={agente}>
              <line
                x1="50%"
                y1="30"
                x2={`${x}%`}
                y2="90"
                stroke={isRejeitado ? "#e74c3c" : "#ccc"}
                strokeWidth="2"
                markerEnd={isRejeitado ? "url(#arrowRed)" : "url(#arrow)"}
              />
            </g>
          );
        })}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <polygon points="0,0 10,5 0,10" fill="#ccc" />
          </marker>
          <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <polygon points="0,0 10,5 0,10" fill="#e74c3c" />
          </marker>
        </defs>
      </svg>

      <div className={styles.agentes}>
        {agentes.map((agente) => (
          <div key={agente} className={styles.coluna}>
            <div className={styles.card + " " + getStatusClass(agente)}>
              <div className={styles.nome}>{agente}</div>
              {getInvestigadorInfo(agente) && (
                <div className={styles.info}>{getInvestigadorInfo(agente)}</div>
              )}
              {getTempo(agente) && <div className={styles.tempo}>{getTempo(agente)}</div>}
              {getTokens(agente) && <div className={styles.tokens}>{getTokens(agente)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
