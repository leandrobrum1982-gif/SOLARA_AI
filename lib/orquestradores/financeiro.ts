import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { agente } from "@/lib/agente";

export const maxDuration = 60;

interface Divergencia {
  id: string;
  tipo_inicial: string;
  lancamento_id?: string;
  cod_titulo?: string;
  valor_lancamento: number;
  valor_titulo?: number;
}

interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

export async function orquestradorFinanceiro(extrato_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    // Busca divergências
    const { data: divergencias } = await supabase
      .from("divergencias")
      .select("*")
      .eq("extrato_id", extrato_id)
      .eq("status", "nova");

    if (!divergencias || divergencias.length === 0) {
      return;
    }

    // Cria execução raiz do orquestrador
    const { data: execRaiz } = await supabase
      .from("execucoes_agentes")
      .insert({
        area: "financeiro",
        item_tipo: "extrato",
        item_id: extrato_id,
        agente: "orquestrador",
        status: "rodando",
        entrada: { extrato_id },
        inicio: new Date().toISOString(),
      })
      .select()
      .single();

    const execRaizId = execRaiz?.id;

    // Atualiza divergências para investigando
    await supabase
      .from("divergencias")
      .update({ status: "investigando" })
      .eq("extrato_id", extrato_id)
      .eq("status", "nova");

    // 2. Investigador (Promise.all - todos em paralelo)
    const investigacoes = await Promise.all(
      divergencias.map(async (div: any) => {
        // Busca lançamento relacionado
        let lancamento = null;
        if (div.lancamento_id) {
          const { data } = await supabase
            .from("lancamentos")
            .select("*")
            .eq("id", div.lancamento_id)
            .single();
          lancamento = data;
        }

        // Busca títulos candidatos (mesmo cliente ou valor próximo)
        const { data: titulos } = await supabase
          .from("titulos_receber")
          .select("*")
          .eq("status", "aberto")
          .or(
            `valor.gte.${(div.valor_lancamento || 0) * 0.9},valor.lte.${(div.valor_lancamento || 0) * 1.1}`
          )
          .limit(10);

        const resultado = await agente(
          "investigador",
          {
            divergencia: div,
            lancamento,
            titulos_candidatos: titulos || [],
          },
          {
            area: "financeiro",
            item_tipo: "divergencia",
            item_id: div.id,
            chamado_por: execRaizId,
          }
        );

        return { divergencia_id: div.id, hipotese: resultado.saida };
      })
    );

    // 3. Consolidador
    const resumo = {
      qtd_divergencias: divergencias.length,
      valor_divergente: divergencias.reduce((sum, d) => sum + (d.valor_lancamento || 0), 0),
    };

    const consolidadorResult = await agente(
      "consolidador",
      {
        resumo_casamento: resumo,
        hipoteses: investigacoes.map((inv) => inv.hipotese),
      },
      {
        area: "financeiro",
        item_tipo: "extrato",
        item_id: extrato_id,
        chamado_por: execRaizId,
      }
    );

    const relatorio = consolidadorResult.saida as any;

    // 4. Revisor
    const { data: titulosAbertos } = await supabase
      .from("titulos_receber")
      .select("*")
      .eq("status", "aberto");

    const revisorResult = await agente(
      "revisor",
      {
        hipoteses: investigacoes.map((inv) => inv.hipotese),
        titulos_abertos: titulosAbertos || [],
        relatorio: relatorio.relatorio_markdown,
      },
      {
        area: "financeiro",
        item_tipo: "extrato",
        item_id: extrato_id,
        chamado_por: execRaizId,
      }
    );

    const revisao = revisorResult.saida as any;

    // Se rejeitou, chama consolidador de novo
    if (!revisao.aprovado) {
      const consolidadorResult2 = await agente(
        "consolidador",
        {
          resumo_casamento: resumo,
          hipoteses: investigacoes.map((inv) => inv.hipotese),
          motivos: revisao.motivos,
        },
        {
          area: "financeiro",
          item_tipo: "extrato",
          item_id: extrato_id,
          chamado_por: execRaizId,
        }
      );

      const relatorio2 = consolidadorResult2.saida as any;
    }

    // 5. Cria aprovações (uma por divergência)
    const aprovacoes = investigacoes.map((inv: any) => ({
      area: "financeiro",
      item_tipo: "divergencia",
      item_id: inv.divergencia_id,
      titulo: `${inv.hipotese.hipotese} · ${inv.hipotese.explicacao?.slice(0, 40) || ""}`,
      proposta: {
        hipotese: inv.hipotese,
        relatorio,
      },
      status: "pendente",
    }));

    await supabase.from("aprovacoes").insert(aprovacoes);

    // Atualiza divergências para aguardando_aprovacao
    await supabase
      .from("divergencias")
      .update({ status: "aguardando_aprovacao" })
      .eq("extrato_id", extrato_id)
      .eq("status", "investigando");

    // Fecha execução raiz
    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", execRaizId);
  } catch (error) {
    console.error("Erro no orquestrador de financeiro:", error);
    throw error;
  }
}
