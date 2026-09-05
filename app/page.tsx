import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: "40px", textAlign: "center" }}>
      <h1>Solara OS</h1>
      <p style={{ marginTop: "20px", fontSize: "16px", color: "#666" }}>
        Bem-vindo, <strong>{user.email}</strong>
      </p>
    </main>
  );
}
