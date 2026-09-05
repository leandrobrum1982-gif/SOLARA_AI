import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { agente } from "@/lib/agente";

interface PedidoOrcamento {
  id: string;
  cod_pedido: string;
  cliente_id: string;
  canal: string;
  mensagem: string;
  status: string;
}

interface Cliente {
  cod_cliente: string;
  nome: string;
  segmento: string;
  prazo_pagamento_dias: number;
  desconto_maximo_pct: number;
  cliente_desde?: string;
}

interface Produto {
  cod_produto: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
}

export async function orquestradorVendas(cod_pedido: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    // Busca pedido
    const { data: pedido } = await supabase
      .from("pedidos_orcamento")
      .select("*")
      .eq("cod_pedido", cod_pedido)
      .single();

    if (!pedido) {
      throw new Error(`Pedido ${cod_pedido} não encontrado`);
    }

    // Atualiza para processando
    await supabase
      .from("pedidos_orcamento")
      .update({ status: "processando" })
      .eq("cod_pedido", cod_pedido);

    // Cria execução raiz do orquestrador
    const { data: execRaiz } = await supabase
      .from("execucoes_agentes")
      .insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: cod_pedido,
        agente: "orquestrador",
        status: "rodando",
        entrada: { cod_pedido },
        inicio: new Date().toISOString(),
      })
      .select()
      .single();

    const execRaizId = execRaiz?.id;

    // Busca cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("cod_cliente", pedido.cliente_id)
      .single();

    // 1. Triador
    const triadorResult = await agente(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: pedido.cliente_id,
          nome: cliente?.nome,
          segmento: cliente?.segmento,
        },
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: cod_pedido,
        chamado_por: execRaizId,
      }
    );

    const triagem = triadorResult.saida as any;

    // Verifica se é orçamento ou complemento
    if (triagem.tipo !== "orcamento" && triagem.tipo !== "complemento") {
      await supabase
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", cod_pedido);

      await supabase
        .from("aprovacoes")
        .insert({
          area: "vendas",
          item_tipo: "pedido",
          item_id: cod_pedido,
          titulo: `Não é orçamento: ${triagem.tipo}`,
          proposta: triagem,
          status: "pendente",
        });

      await supabase
        .from("execucoes_agentes")
        .update({ status: "ok", fim: new Date().toISOString() })
        .eq("id", execRaizId);

      return;
    }

    // 2. Pesquisador (busca no banco)
    const candidatos = await buscarCandidatos(supabase, triagem.itens);

    const pedidosAnteriores = await supabase
      .from("pedidos_orcamento")
      .select("cod_pedido, data, status")
      .eq("cliente_id", pedido.cliente_id)
      .gte("data", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .neq("cod_pedido", cod_pedido)
      .order("data", { ascending: false });

    const pesquisadorResult = await agente(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatos,
        cliente: cliente,
        pedidos_anteriores: pedidosAnteriores.data || [],
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: cod_pedido,
        chamado_por: execRaizId,
      }
    );

    const contexto = pesquisadorResult.saida as any;

    // 3. Redator (primeira vez)
    let redatorResult = await agente(
      "redator",
      {
        triagem,
        contexto,
        cliente: { nome: cliente?.nome, segmento: cliente?.segmento },
      },
      {
        area: "vendas",
        item_tipo: "pedido",
        item_id: cod_pedido,
        chamado_por: execRaizId,
      }
    );

    let redacao = redatorResult.saida as any;
    let revisao = null;
    let numVoltas = 0;

    // 4. Revisor (com loop até 2 voltas)
    while (numVoltas < 2) {
      const revisorResult = await agente(
        "revisor",
        {
          resposta: redacao.resposta,
          contexto,
          regras: [
            "Não prometer entrega imediata de item cujo estoque não atende",
            "Não oferecer desconto acima do máximo",
            "Não citar produto que não existe no contexto",
            "Preços e quantidades devem bater com contexto",
            "Condição de pagamento igual à do contexto",
          ],
        },
        {
          area: "vendas",
          item_tipo: "pedido",
          item_id: cod_pedido,
          chamado_por: execRaizId,
        }
      );

      revisao = revisorResult.saida as any;

      if (revisao.aprovado) {
        break;
      }

      numVoltas++;
      if (numVoltas < 2) {
        // Chama redator de novo
        redatorResult = await agente(
          "redator",
          {
            triagem,
            contexto,
            cliente: { nome: cliente?.nome, segmento: cliente?.segmento },
            ajustes: revisao.motivos,
          },
          {
            area: "vendas",
            item_tipo: "pedido",
            item_id: cod_pedido,
            chamado_por: execRaizId,
          }
        );

        redacao = redatorResult.saida as any;
      }
    }

    // 5. Cria item em aprovacoes
    const titulo = `${cliente?.nome} · ${redacao.resumo || "Orçamento"}`;

    await supabase
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", cod_pedido);

    await supabase
      .from("aprovacoes")
      .insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: cod_pedido,
        titulo,
        proposta: {
          resposta: redacao.resposta,
          triagem,
          contexto,
          revisao,
        },
        status: "pendente",
      });

    // Fecha execução raiz
    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", execRaizId);
  } catch (error) {
    console.error("Erro no orquestrador de vendas:", error);
    throw error;
  }
}

async function buscarCandidatos(supabase: any, itens: any[]) {
  const candidatos = [];

  for (const item of itens) {
    // Busca por similaridade de descrição
    const palavras = item.descricao_cliente.toLowerCase().split(/\s+/);
    const filtro = palavras.map((p: string) => `descricao.ilike.%${p}%`).join("&");

    const { data: produtos } = await supabase
      .from("produtos")
      .select("*")
      .limit(5);

    // Filtra localmente por relevância
    const relevantes = (produtos || [])
      .filter((p: any) =>
        palavras.some((w: string) =>
          p.descricao?.toLowerCase().includes(w)
        )
      )
      .slice(0, 3);

    candidatos.push({
      descricao_cliente: item.descricao_cliente,
      quantidade: item.quantidade,
      unidade: item.unidade,
      candidatos_catalogo: relevantes,
    });
  }

  return candidatos;
}
