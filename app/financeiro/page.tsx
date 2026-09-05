import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import TelasFinanceiro from "@/components/TelasFinanceiro";

export default async function FinanceiroPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verifica se o usuário tem acesso a financeiro
  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .single();

  if (!(perfil as any)?.areas?.includes("financeiro")) {
    redirect("/");
  }

  return <TelasFinanceiro />;
}
