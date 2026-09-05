"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import styles from "./FilaAprovacao.module.css";

interface Aprovacao {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  titulo: string;
  proposta: unknown;
  status: "pendente" | "aprovada" | "editada" | "rejeitada";
  observacao?: string;
}

interface FilaAprovacaoProps {
  area: string;
}

export default function FilaAprovacao({ area }: FilaAprovacaoProps) {
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [selecionada, setSelecionada] = useState<Aprovacao | null>(null);
  const [propostaEditada, setPropostaEditada] = useState("");
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const carregarAprovacoes = async () => {
      const { data } = await supabase
        .from("aprovacoes")
        .select("*")
        .eq("area", area)
        .eq("status", "pendente")
        .order("criado_em", { ascending: true });

      if (data) {
        setAprovacoes(data);
      }
    };

    carregarAprovacoes();

    const subscription = supabase
      .channel(`aprovacoes:${area}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "aprovacoes",
          filter: `area=eq.${area}`,
        },
        () => {
          carregarAprovacoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [area]);

  const handleAprovar = async () => {
    if (!selecionada) return;
    setCarregando(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("aprovacoes")
      .update({
        status: "aprovada",
        decidido_por: user?.id,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", selecionada.id);

    setAprovacoes((prev) => prev.filter((a) => a.id !== selecionada.id));
    setSelecionada(null);
    setPropostaEditada("");
    setCarregando(false);
  };

  const handleEditar = async () => {
    if (!selecionada) return;
    setCarregando(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("aprovacoes")
      .update({
        status: "editada",
        proposta: propostaEditada
          ? { ...(selecionada.proposta as Record<string, unknown>), editado: propostaEditada }
          : selecionada.proposta,
        decidido_por: user?.id,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", selecionada.id);

    setAprovacoes((prev) => prev.filter((a) => a.id !== selecionada.id));
    setSelecionada(null);
    setPropostaEditada("");
    setCarregando(false);
  };

  const handleRejeitar = async () => {
    if (!selecionada || !observacao) return;
    setCarregando(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("aprovacoes")
      .update({
        status: "rejeitada",
        observacao,
        decidido_por: user?.id,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", selecionada.id);

    setAprovacoes((prev) => prev.filter((a) => a.id !== selecionada.id));
    setSelecionada(null);
    setObservacao("");
    setCarregando(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.lista}>
        <h3>Fila de Aprovação ({aprovacoes.length})</h3>
        {aprovacoes.length === 0 ? (
          <p className={styles.vazio}>Nenhum item pendente</p>
        ) : (
          <div className={styles.itens}>
            {aprovacoes.map((aprovacao) => (
              <div
                key={aprovacao.id}
                className={styles.item + (selecionada?.id === aprovacao.id ? " " + styles.selecionado : "")}
                onClick={() => {
                  setSelecionada(aprovacao);
                  setPropostaEditada("");
                  setObservacao("");
                }}
              >
                <div className={styles.itemTitulo}>{aprovacao.titulo}</div>
                <div className={styles.itemTipo}>{aprovacao.item_tipo}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selecionada && (
        <div className={styles.detalhe}>
          <h3>{selecionada.titulo}</h3>

          <div className={styles.proposta}>
            <h4>Proposta</h4>
            <pre>{JSON.stringify(selecionada.proposta, null, 2)}</pre>
          </div>

          <div className={styles.edicao}>
            <label>Editar proposta (opcional):</label>
            <textarea
              value={propostaEditada}
              onChange={(e) => setPropostaEditada(e.target.value)}
              placeholder="Deixe em branco para manter a proposta original"
              rows={4}
            />
          </div>

          <div className={styles.rejeicao}>
            <label>Motivo da rejeição (se rejeitar):</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Descreva o motivo"
              rows={3}
            />
          </div>

          <div className={styles.botoes}>
            <button
              onClick={handleAprovar}
              disabled={carregando}
              className={styles.aprovado}
            >
              Aprovar
            </button>
            <button
              onClick={handleEditar}
              disabled={carregando}
              className={styles.editado}
            >
              Salvar Edição e Aprovar
            </button>
            <button
              onClick={handleRejeitar}
              disabled={carregando || !observacao}
              className={styles.rejeitado}
            >
              Rejeitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
