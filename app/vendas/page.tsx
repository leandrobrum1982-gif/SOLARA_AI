import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import TelasVendas from "@/components/TelasVendas";

export default async function VendasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verifica se o usuário tem acesso a vendas
  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .single();

  if (!(perfil as any)?.areas?.includes("vendas")) {
    redirect("/");
  }

  // Busca clientes para o formulário
  const { data: clientes } = await supabase
    .from("clientes")
    .select("cod_cliente, nome")
    .order("nome");

  return <TelasVendas clientes={clientes || []} />;
}
