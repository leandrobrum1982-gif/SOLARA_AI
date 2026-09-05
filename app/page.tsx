import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import styles from "./home.module.css";

interface Perfil {
  areas: string[];
  papel: string;
}

export default async function Home() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Busca o perfil do usuário
  const { data: perfil } = await supabase
    .from("perfis")
    .select("areas, papel")
    .eq("id", user.id)
    .single();

  const areas = (perfil as Perfil)?.areas || [];
  const eh_admin = (perfil as Perfil)?.papel === "admin";

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Solara OS</h1>
        <div className={styles.user}>
          <span>{user.email}</span>
          {eh_admin && <span className={styles.admin}>Admin</span>}
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.grid}>
          {/* Vendas */}
          <Link
            href="/vendas"
            className={
              areas.includes("vendas")
                ? styles.card + " " + styles.ativo
                : styles.card + " " + styles.inativo
            }
          >
            <h2>Vendas</h2>
            <p>Processamento de orçamentos e pedidos</p>
            {!areas.includes("vendas") && <span className={styles.em_breve}>em breve</span>}
          </Link>

          {/* Financeiro */}
          <Link
            href="/financeiro"
            className={
              areas.includes("financeiro")
                ? styles.card + " " + styles.ativo
                : styles.card + " " + styles.inativo
            }
          >
            <h2>Financeiro</h2>
            <p>Conciliação de extratos e títulos</p>
            {!areas.includes("financeiro") && <span className={styles.em_breve}>em breve</span>}
          </Link>

          {/* RH */}
          <div className={styles.card + " " + styles.inativo}>
            <h2>RH</h2>
            <p>Gestão de pessoal e documentos</p>
            <span className={styles.em_breve}>em breve</span>
          </div>

          {/* Jurídico */}
          <div className={styles.card + " " + styles.inativo}>
            <h2>Jurídico</h2>
            <p>Análise de contratos e demandas</p>
            <span className={styles.em_breve}>em breve</span>
          </div>

          {/* Operações */}
          <div className={styles.card + " " + styles.inativo}>
            <h2>Operações</h2>
            <p>Gestão de logística e entrega</p>
            <span className={styles.em_breve}>em breve</span>
          </div>

          {/* Admin */}
          {eh_admin && (
            <Link href="/admin" className={styles.card + " " + styles.ativo}>
              <h2>⚙️ Admin</h2>
              <p>Gerenciar usuários e permissões</p>
            </Link>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <a href="/api/auth/logout">Sair</a>
      </footer>
    </main>
  );
}
