import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import AdminPanel from "@/components/AdminPanel";

interface Perfil {
  id: string;
  email: string;
  nome: string;
  papel: string;
  areas: string[];
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verifica se é admin
  const { data: perfil } = await supabase
    .from("perfis")
    .select("papel")
    .eq("id", user.id)
    .single();

  if ((perfil as any)?.papel !== "admin") {
    redirect("/");
  }

  // Busca todos os perfis
  const { data: perfis } = await supabase
    .from("perfis")
    .select("*")
    .order("criado_em", { ascending: false });

  return <AdminPanel perfis={(perfis || []) as Perfil[]} />;
}
