interface Lancamento {
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

interface Titulo {
  cod_titulo: string;
  nota_fiscal: string | null;
  valor: number;
  vencimento: string;
  cliente_id: string;
  status: "aberto" | "pago" | "pago_parcial" | "vencido";
}

interface ResultadoCasamento {
  cod_titulo: string | null;
  situacao: "casado" | "divergente" | "ignorado";
  tipo_inicial?: string;
}

export function casarLancamentos(
  lancamentos: Lancamento[],
  titulos: Titulo[]
): Map<number, ResultadoCasamento> {
  const resultado = new Map<number, ResultadoCasamento>();

  lancamentos.forEach((lancamento, idx) => {
    if (lancamento.tipo === "debito") {
      // Débitos são ignorados
      resultado.set(idx, { cod_titulo: null, situacao: "ignorado" });
    } else {
      // Créditos: tenta casar
      const casamento = casarCredito(lancamento, titulos, resultado);
      resultado.set(idx, casamento);
    }
  });

  // Após casar, procura títulos vencidos sem pagamento
  const dataFinal = Math.max(...lancamentos.map((l) => new Date(l.data).getTime()));
  const titulosVencidos = titulos.filter(
    (t) => t.status === "aberto" && new Date(t.vencimento).getTime() < dataFinal
  );

  titulosVencidos.forEach((titulo) => {
    const jaFoiCasado = Array.from(resultado.values()).some(
      (r) => r.cod_titulo === titulo.cod_titulo && r.situacao === "casado"
    );

    if (!jaFoiCasado) {
      // Cria divergência de vencido sem pagamento
      resultado.set(-1, {
        cod_titulo: titulo.cod_titulo,
        situacao: "divergente",
        tipo_inicial: "vencido_sem_pagamento",
      });
    }
  });

  return resultado;
}

function casarCredito(
  lancamento: Lancamento,
  titulos: Titulo[],
  resultadoAteAgora: Map<number, ResultadoCasamento>
): ResultadoCasamento {
  // 1. Procura NF na descrição
  const nfMatch = lancamento.descricao.match(/NF-?(\d+)/i);
  if (nfMatch) {
    const nf = `NF-${nfMatch[1]}`;
    const tituloComNF = titulos.find(
      (t) => t.nota_fiscal === nf && t.status === "aberto"
    );

    if (tituloComNF) {
      if (Math.abs(tituloComNF.valor - lancamento.valor) < 0.01) {
        // Casado
        return { cod_titulo: tituloComNF.cod_titulo, situacao: "casado" };
      } else {
        // Mesma NF, valor diferente
        return {
          cod_titulo: tituloComNF.cod_titulo,
          situacao: "divergente",
          tipo_inicial: "valor_diferente_mesma_nf",
        };
      }
    }
  }

  // 2. Procura título com mesmo valor e vencimento próximo
  const titulosComMesmoValor = titulos.filter(
    (t) =>
      t.status === "aberto" &&
      Math.abs(t.valor - lancamento.valor) < 0.01
  );

  if (titulosComMesmoValor.length === 1) {
    const titulo = titulosComMesmoValor[0];
    const diasDiferenca = Math.abs(
      new Date(titulo.vencimento).getTime() - new Date(lancamento.data).getTime()
    ) / (1000 * 60 * 60 * 24);

    if (diasDiferenca <= 5) {
      return { cod_titulo: titulo.cod_titulo, situacao: "casado" };
    }
  }

  // 3. Não casou: divergente
  if (titulosComMesmoValor.length === 0) {
    return {
      cod_titulo: null,
      situacao: "divergente",
      tipo_inicial: "sem_titulo_correspondente",
    };
  }

  // 4. Procura possível soma de dois títulos
  const pares = encontrarPares(titulosComMesmoValor, lancamento.valor);
  if (pares.length > 0) {
    return {
      cod_titulo: pares.map((t) => t.cod_titulo).join(","),
      situacao: "divergente",
      tipo_inicial: "possivel_soma",
    };
  }

  // 5. Verifica duplicado (já casado com mesmo título)
  const jaFoiCasado = Array.from(Array.isArray(resultadoAteAgora) ? resultadoAteAgora : [])
    .filter((r) => r && r[1]?.situacao === "casado")
    .some((r) => r[1]?.cod_titulo === titulosComMesmoValor[0]?.cod_titulo);

  if (jaFoiCasado) {
    return {
      cod_titulo: titulosComMesmoValor[0].cod_titulo,
      situacao: "divergente",
      tipo_inicial: "duplicado",
    };
  }

  return {
    cod_titulo: titulosComMesmoValor[0]?.cod_titulo || null,
    situacao: "divergente",
    tipo_inicial: "valor_diferente_mesma_nf",
  };
}

function encontrarPares(titulos: Titulo[], valor: number): Titulo[] {
  // Procura por dois títulos cuja soma = valor
  for (let i = 0; i < titulos.length; i++) {
    for (let j = i + 1; j < titulos.length; j++) {
      if (
        Math.abs(titulos[i].valor + titulos[j].valor - valor) < 0.01
      ) {
        return [titulos[i], titulos[j]];
      }
    }
  }

  return [];
}
