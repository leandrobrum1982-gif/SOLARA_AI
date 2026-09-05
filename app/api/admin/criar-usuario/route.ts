import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

interface CriarUsuarioRequest {
  email: string;
  senha: string;
  nome: string;
  papel: "operador" | "admin";
  areas: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { email, senha, nome, papel, areas } = (await request.json()) as CriarUsuarioRequest;

    // Validação básica
    if (!email || !senha || !nome) {
      return NextResponse.json(
        { error: "E-mail, senha e nome são obrigatórios" },
        { status: 400 }
      );
    }

    // Cria cliente com service role (privilégios de admin)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    // 1. Cria usuário no Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: `Erro ao criar usuário no Auth: ${authError?.message}` },
        { status: 400 }
      );
    }

    // 2. Cria linha em perfis
    const { data: perfilData, error: perfilError } = await supabase
      .from("perfis")
      .insert({
        id: authData.user.id,
        email,
        nome,
        papel,
        areas: areas && areas.length > 0 ? areas : [],
      })
      .select()
      .single();

    if (perfilError || !perfilData) {
      // Se falhar, tenta deletar o usuário criado
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `Erro ao criar perfil: ${perfilError?.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      perfil: perfilData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
