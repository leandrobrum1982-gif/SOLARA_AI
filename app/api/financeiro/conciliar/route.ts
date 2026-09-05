import { NextRequest, NextResponse } from "next/server";
import { orquestradorFinanceiro } from "@/lib/orquestradores/financeiro";

export const maxDuration = 60;

interface ConciliarRequest {
  extrato_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const { extrato_id } = (await request.json()) as ConciliarRequest;

    if (!extrato_id) {
      return NextResponse.json(
        { error: "extrato_id é obrigatório" },
        { status: 400 }
      );
    }

    await orquestradorFinanceiro(extrato_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
