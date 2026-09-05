import { NextRequest, NextResponse } from "next/server";
import { orquestradorVendas } from "@/lib/orquestradores/vendas";

export const maxDuration = 60;

interface ProcessarRequest {
  cod_pedido: string;
}

export async function POST(request: NextRequest) {
  try {
    const { cod_pedido } = (await request.json()) as ProcessarRequest;

    if (!cod_pedido) {
      return NextResponse.json(
        { error: "cod_pedido é obrigatório" },
        { status: 400 }
      );
    }

    await orquestradorVendas(cod_pedido);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
