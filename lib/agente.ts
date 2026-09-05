import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import * as fs from "fs";
import * as path from "path";

interface AgenteContexto {
  area: string;
  item_tipo: string;
  item_id: string;
  chamado_por?: string;
}

interface AgenteResposta {
  saida: unknown;
  execucao_id: string;
}

export async function agente(
  papel: string,
  entrada: unknown,
  contexto: AgenteContexto
): Promise<AgenteResposta> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let execucao_id = "";
  const inicio = new Date();

  try {
    // 1. Insere linha em execucoes_agentes com status = rodando
    const { data: execucaoData, error: execucaoError } = await supabase
      .from("execucoes_agentes")
      .insert({
        area: contexto.area,
        item_tipo: contexto.item_tipo,
        item_id: contexto.item_id,
        agente: papel,
        chamado_por: contexto.chamado_por || null,
        status: "rodando",
        entrada: entrada,
        inicio: inicio.toISOString(),
      })
      .select()
      .single();

    if (execucaoError || !execucaoData) {
      throw new Error(`Erro ao criar registro de execução: ${execucaoError?.message}`);
    }

    execucao_id = execucaoData.id;

    // 2. Lê o system prompt de prompts/<area>/<papel>.md
    const promptPath = path.join(
      process.cwd(),
      "prompts",
      contexto.area,
      `${papel}.md`
    );

    let systemPrompt = "";
    try {
      systemPrompt = fs.readFileSync(promptPath, "utf-8");
    } catch {
      throw new Error(`Prompt não encontrado: ${promptPath}`);
    }

    // 3. Chama a API Anthropic
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: JSON.stringify(entrada),
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      throw new Error(
        `Erro na API Anthropic: ${anthropicResponse.status} ${anthropicResponse.statusText}`
      );
    }

    interface AnthropicMessage {
      content: Array<{ type: string; text: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    }

    const anthropicData = (await anthropicResponse.json()) as AnthropicMessage;
    const responseText = anthropicData.content[0]?.text || "";
    const tokens_entrada = anthropicData.usage?.input_tokens || 0;
    const tokens_saida = anthropicData.usage?.output_tokens || 0;

    // 4. Faz JSON.parse
    let saida: unknown;
    try {
      saida = JSON.parse(responseText);
    } catch {
      // Se falhar, marca erro
      const fim = new Date();
      await supabase
        .from("execucoes_agentes")
        .update({
          status: "erro",
          erro: `Erro ao fazer parse da resposta JSON: ${responseText}`,
          fim: fim.toISOString(),
          tokens_entrada,
          tokens_saida,
        })
        .eq("id", execucao_id);

      throw new Error(`Resposta não é JSON válido: ${responseText.slice(0, 100)}`);
    }

    // 5. Atualiza a linha com status = ok
    const fim = new Date();
    await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida: saida,
        fim: fim.toISOString(),
        tokens_entrada,
        tokens_saida,
      })
      .eq("id", execucao_id);

    // 6. Devolve saida e execucao_id
    return {
      saida,
      execucao_id,
    };
  } catch (error) {
    // Se erro não registrado ainda, registra agora
    if (execucao_id) {
      const fim = new Date();
      await supabase
        .from("execucoes_agentes")
        .update({
          status: "erro",
          erro: error instanceof Error ? error.message : String(error),
          fim: fim.toISOString(),
        })
        .eq("id", execucao_id);
    }

    throw error;
  }
}
