"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "./Organograma";
import FilaAprovacao from "./FilaAprovacao";
import LinhaDoTempo from "./LinhaDoTempo";
import styles from "./TelasVendas.module.css";

interface Cliente {
  cod_cliente: string;
  nome: string;
}

interface Pedido {
  id: string;
  cod_pedido: string;
  cliente_id: string;
  cliente?: { nome: string };
  canal: string;
  mensagem: string;
  status: "novo" | "processando" | "aguardando_aprovacao" | "respondido" | "rejeitado";
  data: string;
}

interface TelasVendasProps {
  clientes: Cliente[];
}

const CANAIS = ["email", "whatsapp", "telefone", "sistema"];
const COLUNAS: Array<Pedido["status"]> = [
  "novo",
  "processando",
  "aguardando_aprovacao",
  "respondido",
  "rejeitado",
];

export default function TelasVendas({ clientes }: TelasVendasProps) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<"kanban" | "linhaDoTempo" | "aprovacoes">("kanban");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [novoClienteId, setNovoClienteId] = useState("");
  const [novoCanal, setNovoCanal] = useState("email");
  const [novoMensagem, setNovoMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase
        .from("pedidos_orcamento")
        .select("*, clientes(nome)")
        .order("data", { ascending: false });

      if (data) {
        setPedidos(data as any);
      }
    };

    carregar();

    const subscription = supabase
      .channel("pedidos_vendas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos_orcamento",
        },
        () => {
          carregar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase]);

  const handleNovoPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoClienteId || !novoMensagem) return;

    setCarregando(true);
    try {
      // Gera cod_pedido sequencial
      const ultimoPedido = pedidos[0];
      let proxNum = 1;
      if (ultimoPedido?.cod_pedido) {
        const num = parseInt(ultimoPedido.cod_pedido.replace("PED", ""));
        proxNum = num + 1;
      }
      const novo_cod = `PED${String(proxNum).padStart(3, "0")}`;

      const { error } = await supabase
        .from("pedidos_orcamento")
        .insert({
          cod_pedido: novo_cod,
          cliente_id: novoClienteId,
          canal: novoCanal,
          mensagem: novoMensagem,
          status: "novo",
          data: new Date().toISOString(),
        });

      if (!error) {
        setNovoClienteId("");
        setNovoCanal("email");
        setNovoMensagem("");
        setMostrarFormulario(false);
      }
    } finally {
      setCarregando(false);
    }
  };

  const handleProcessar = async (cod_pedido: string) => {
    try {
      const response = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido }),
      });

      if (!response.ok) {
        alert("Erro ao processar pedido");
      }
    } catch (err) {
      alert("Erro ao processar pedido");
    }
  };

  const pedidoSelecionado = pedidos.find((p) => p.cod_pedido === selecionado);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Vendas</h1>
        <a href="/">← Voltar</a>
      </header>

      <div className={styles.organorama}>
        <Organograma area="vendas" item_id={selecionado || ""} />
      </div>

      <div className={styles.tabs}>
        <button
          className={aba === "kanban" ? styles.ativo : ""}
          onClick={() => setAba("kanban")}
        >
          📋 Kanban
        </button>
        <button
          className={aba === "linhaDoTempo" ? styles.ativo : ""}
          onClick={() => setAba("linhaDoTempo")}
        >
          ⏱️ Execução
        </button>
        <button
          className={aba === "aprovacoes" ? styles.ativo : ""}
          onClick={() => setAba("aprovacoes")}
        >
          ✅ Aprovações
        </button>
      </div>

      {aba === "kanban" && (
        <div className={styles.conteudo}>
          <div className={styles.kanban}>
            {COLUNAS.map((status) => (
              <div key={status} className={styles.coluna}>
                <div className={styles.colunaHeader}>
                  <h3>{status.replace(/_/g, " ")}</h3>
                  <span className={styles.contador}>
                    {pedidos.filter((p) => p.status === status).length}
                  </span>
                </div>

                <div className={styles.cartoes}>
                  {pedidos
                    .filter((p) => p.status === status)
                    .map((pedido) => (
                      <div
                        key={pedido.cod_pedido}
                        className={
                          styles.cartao +
                          (selecionado === pedido.cod_pedido ? " " + styles.selecionado : "")
                        }
                        onClick={() => setSelecionado(pedido.cod_pedido)}
                      >
                        <div className={styles.codPedido}>{pedido.cod_pedido}</div>
                        <div className={styles.cliente}>{pedido.cliente?.nome}</div>
                        <div className={styles.canal}>{pedido.canal}</div>
                        <div className={styles.data}>
                          {new Date(pedido.data).toLocaleDateString("pt-BR")}
                        </div>
                        <div className={styles.mensagem}>
                          {pedido.mensagem.slice(0, 80)}
                          {pedido.mensagem.length > 80 ? "..." : ""}
                        </div>

                        {status === "novo" && (
                          <button
                            className={styles.processar}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProcessar(pedido.cod_pedido);
                            }}
                          >
                            Processar
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {!mostrarFormulario ? (
            <button
              className={styles.novoPedido}
              onClick={() => setMostrarFormulario(true)}
            >
              + Novo Pedido
            </button>
          ) : (
            <form onSubmit={handleNovoPedido} className={styles.formulario}>
              <h3>Novo Pedido</h3>

              <select
                value={novoClienteId}
                onChange={(e) => setNovoClienteId(e.target.value)}
                required
              >
                <option value="">Selecione o cliente</option>
                {clientes.map((c) => (
                  <option key={c.cod_cliente} value={c.cod_cliente}>
                    {c.nome}
                  </option>
                ))}
              </select>

              <select
                value={novoCanal}
                onChange={(e) => setNovoCanal(e.target.value)}
              >
                {CANAIS.map((canal) => (
                  <option key={canal} value={canal}>
                    {canal}
                  </option>
                ))}
              </select>

              <textarea
                value={novoMensagem}
                onChange={(e) => setNovoMensagem(e.target.value)}
                placeholder="Mensagem do cliente"
                required
                rows={4}
              />

              <div className={styles.botoes}>
                <button type="submit" disabled={carregando}>
                  {carregando ? "Criando..." : "Criar"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarFormulario(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {aba === "linhaDoTempo" && selecionado && (
        <div className={styles.conteudo}>
          <LinhaDoTempo item_id={selecionado} />
        </div>
      )}

      {aba === "aprovacoes" && (
        <div className={styles.conteudo}>
          <FilaAprovacao area="vendas" />
        </div>
      )}
    </div>
  );
}
