"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { limparExtrato } from "@/lib/financeiro/limpar";
import { casarLancamentos } from "@/lib/financeiro/casar";
import Organograma from "./Organograma";
import FilaAprovacao from "./FilaAprovacao";
import LinhaDoTempo from "./LinhaDoTempo";
import styles from "./TelasFinanceiro.module.css";

interface Lancamento {
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

interface Divergencia {
  id: string;
  status: "nova" | "investigando" | "aguardando_aprovacao" | "resolvida";
  hipotese?: string;
  valor_lancamento: number;
}

interface ResultadoConciliacao {
  extratoId: string;
  bateram: number;
  divergencias: Divergencia[];
  ignorados: number;
}

export default function TelasFinanceiro() {
  const [aba, setAba] = useState<"upload" | "resultados" | "relatorio" | "aprovacoes">("upload");
  const [resultado, setResultado] = useState<ResultadoConciliacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [linhasAntes, setLinhasAntes] = useState<string[]>([]);
  const [linhasDepois, setLinhasDepois] = useState<Lancamento[]>([]);

  const supabase = createClient();

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCarregando(true);
    setMensagem("");

    try {
      const formData = new FormData(e.currentTarget);
      const arquivoExtrato = formData.get("extrato") as File;

      if (!arquivoExtrato) {
        setMensagem("Selecione um arquivo de extrato");
        return;
      }

      // Lê arquivo
      const conteudo = await arquivoExtrato.arrayBuffer();
      const buffer = Buffer.from(conteudo);

      // Armazena linhas antes da limpeza
      const textoOriginal = buffer.toString("utf-8");
      setLinhasAntes(textoOriginal.split("\n").slice(0, 6));

      // Limpa extrato
      const lancamentos = await limparExtrato(buffer);
      setLinhasDepois(lancamentos.slice(0, 6));

      // Insere em extratos_importados
      const { data: extrato, error } = await supabase
        .from("extratos_importados")
        .insert({
          nome_arquivo: arquivoExtrato.name,
          total_linhas: lancamentos.length,
          total_creditos: lancamentos
            .filter((l) => l.tipo === "credito")
            .reduce((sum, l) => sum + l.valor, 0),
          raw_content: textoOriginal,
        })
        .select()
        .single();

      if (error || !extrato) {
        setMensagem("Erro ao salvar extrato");
        return;
      }

      // Insere lançamentos
      const lancamentosComExtratoId = lancamentos.map((l) => ({
        ...l,
        extrato_id: extrato.id,
        situacao: "casado", // placeholder, será atualizado após casamento
      }));

      await supabase.from("lancamentos").insert(lancamentosComExtratoId);

      // Casa lançamentos com títulos (determinístico, sem modelo)
      const { data: titulos } = await supabase
        .from("titulos_receber")
        .select("*");

      const casamento = casarLancamentos(
        lancamentos,
        (titulos || []) as any
      );

      // Atualiza situação dos lançamentos
      const updates = Array.from(lancamentos.entries()).map(([idx, lancamento]) => ({
        data: lancamento.data,
        descricao: lancamento.descricao,
        valor: lancamento.valor,
        tipo: lancamento.tipo,
        situacao: casamento.get(idx)?.situacao || "divergente",
        cod_titulo_casado: casamento.get(idx)?.cod_titulo || null,
        extrato_id: extrato.id,
      }));

      // Cria divergências para os não casados
      const divergenciasNova = Array.from(lancamentos.entries())
        .filter(([idx]) => casamento.get(idx)?.situacao === "divergente")
        .map(([idx, lancamento]) => ({
          extrato_id: extrato.id,
          tipo_inicial: casamento.get(idx)?.tipo_inicial || "sem_titulo_correspondente",
          valor_lancamento: lancamento.valor,
          status: "nova",
        }));

      if (divergenciasNova.length > 0) {
        await supabase.from("divergencias").insert(divergenciasNova);
      }

      setResultado({
        extratoId: extrato.id,
        bateram: Array.from(casamento.values()).filter((c) => c.situacao === "casado").length,
        divergencias: divergenciasNova as any,
        ignorados: Array.from(casamento.values()).filter((c) => c.situacao === "ignorado").length,
      });

      setAba("resultados");
      setMensagem("Extrato importado com sucesso!");
    } catch (err) {
      setMensagem("Erro ao processar arquivo");
      console.error(err);
    } finally {
      setCarregando(false);
    }
  };

  const handleConciliar = async () => {
    if (!resultado?.extratoId) return;

    setCarregando(true);
    try {
      const response = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extrato_id: resultado.extratoId }),
      });

      if (!response.ok) {
        setMensagem("Erro ao conciliar");
      } else {
        setMensagem("Conciliação iniciada! Agentes rodando...");
      }
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Financeiro</h1>
        <a href="/">← Voltar</a>
      </header>

      {resultado && (
        <div className={styles.organograma}>
          <Organograma area="financeiro" item_id={resultado.extratoId} />
        </div>
      )}

      <div className={styles.tabs}>
        <button
          className={aba === "upload" ? styles.ativo : ""}
          onClick={() => setAba("upload")}
        >
          📤 Upload
        </button>
        <button
          className={aba === "resultados" ? styles.ativo : ""}
          onClick={() => setAba("resultados")}
          disabled={!resultado}
        >
          📊 Resultados
        </button>
        <button
          className={aba === "relatorio" ? styles.ativo : ""}
          onClick={() => setAba("relatorio")}
          disabled={!resultado}
        >
          📋 Relatório
        </button>
        <button
          className={aba === "aprovacoes" ? styles.ativo : ""}
          onClick={() => setAba("aprovacoes")}
        >
          ✅ Aprovações
        </button>
      </div>

      <div className={styles.conteudo}>
        {aba === "upload" && (
          <form onSubmit={handleUpload} className={styles.formulario}>
            <h3>Importar Extrato</h3>

            <div className={styles.grupo}>
              <label>Extrato bancário (CSV/TXT, obrigatório)</label>
              <input type="file" name="extrato" accept=".csv,.txt" required disabled={carregando} />
            </div>

            <div className={styles.grupo}>
              <label>Títulos a receber (CSV, opcional)</label>
              <input type="file" name="titulos" accept=".csv,.txt" disabled={carregando} />
            </div>

            {mensagem && <p className={styles.mensagem}>{mensagem}</p>}

            <button type="submit" disabled={carregando}>
              {carregando ? "Importando..." : "Importar"}
            </button>

            {linhasAntes.length > 0 && (
              <div className={styles.avisoAnteDepois}>
                <div>
                  <h4>Arquivo original (primeiras 6 linhas):</h4>
                  <pre>{linhasAntes.slice(0, 6).join("\n")}</pre>
                </div>
                <div>
                  <h4>Após limpeza (primeiras 6 linhas):</h4>
                  <pre>
                    {linhasDepois
                      .slice(0, 6)
                      .map((l) => `${l.data} | ${l.descricao.slice(0, 20)} | R$ ${l.valor}`)
                      .join("\n")}
                  </pre>
                </div>
              </div>
            )}
          </form>
        )}

        {aba === "resultados" && resultado && (
          <div className={styles.resultados}>
            <div className={styles.resumo}>
              <div className={styles.card + " " + styles.bateram}>
                <div className={styles.numero}>{resultado.bateram}</div>
                <div className={styles.label}>Casados</div>
              </div>
              <div className={styles.card + " " + styles.divergencias}>
                <div className={styles.numero}>{resultado.divergencias.length}</div>
                <div className={styles.label}>Divergências</div>
              </div>
              <div className={styles.card + " " + styles.ignorados}>
                <div className={styles.numero}>{resultado.ignorados}</div>
                <div className={styles.label}>Ignorados</div>
              </div>
            </div>

            <button onClick={handleConciliar} disabled={carregando} className={styles.conciliar}>
              {carregando ? "Conciliando..." : "🚀 Conciliar"}
            </button>

            <h4>Divergências (kanban)</h4>
            <div className={styles.kanban}>
              {(["nova", "investigando", "aguardando_aprovacao", "resolvida"] as const).map((status) => (
                <div key={status} className={styles.coluna}>
                  <div className={styles.colunaHeader}>
                    {status}
                    <span className={styles.contador}>
                      {resultado.divergencias.filter((d) => d.status === status).length}
                    </span>
                  </div>
                  <div className={styles.itens}>
                    {resultado.divergencias
                      .filter((d) => d.status === status)
                      .map((div) => (
                        <div key={div.id} className={styles.item}>
                          <div className={styles.valor}>R$ {div.valor_lancamento.toFixed(2)}</div>
                          <div className={styles.hipotese}>{div.hipotese || div.status}</div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {aba === "relatorio" && resultado && (
          <div className={styles.relatorio}>
            <LinhaDoTempo item_id={resultado.extratoId} />
          </div>
        )}

        {aba === "aprovacoes" && (
          <div className={styles.aprovacoes}>
            <FilaAprovacao area="financeiro" />
          </div>
        )}
      </div>
    </div>
  );
}
