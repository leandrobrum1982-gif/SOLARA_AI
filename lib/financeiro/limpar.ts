import * as iconv from "iconv-lite";

interface LinhaLancamento {
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

export async function limparExtrato(conteudo: Buffer | string): Promise<LinhaLancamento[]> {
  let texto: string;

  // Se for string, usa direto; se for buffer, tenta UTF-8, depois Latin-1
  if (typeof conteudo === "string") {
    texto = conteudo;
  } else {
    try {
      texto = conteudo.toString("utf-8");
    } catch {
      texto = iconv.decode(conteudo, "latin1");
    }
  }

  const linhas = texto.split(/\r?\n/).map((l) => l.trim());

  // Detecta separador (`,` ou `;`)
  const separador = detectarSeparador(linhas);

  // Pula até a linha que começa com "Data" ou "data" ou "cod_lancamento"
  let inicio = 0;
  for (let i = 0; i < linhas.length; i++) {
    const primeiro = linhas[i].split(separador)[0].toLowerCase();
    if (primeiro.includes("data") || primeiro.includes("cod_lancamento")) {
      inicio = i + 1;
      break;
    }
  }

  const lancamentos: LinhaLancamento[] = [];

  for (let i = inicio; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    if (linhas[i].toLowerCase().includes("saldo")) continue;

    const campos = linhas[i].split(separador).map((c) => c.trim());
    if (campos.length < 3) continue;

    const data = parseData(campos[0]);
    const descricao = campos[1];
    const valor = parseValor(campos[2]);
    const tipo = valor < 0 ? "debito" : "credito";

    if (data && descricao && valor !== null) {
      lancamentos.push({
        data,
        descricao,
        valor: Math.abs(valor),
        tipo,
      });
    }
  }

  return lancamentos;
}

function detectarSeparador(linhas: string[]): string {
  // Procura por linhas com muitas `,` ou `;`
  for (const linha of linhas) {
    const comVirgula = (linha.match(/,/g) || []).length;
    const comPontoeVirgula = (linha.match(/;/g) || []).length;

    if (comVirgula > comPontoeVirgula && comVirgula > 2) return ",";
    if (comPontoeVirgula > comVirgula && comPontoeVirgula > 2) return ";";
  }

  // Default
  return ",";
}

function parseData(dataStr: string): string | null {
  // Tenta vários formatos
  const formatos = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // dd/mm/yyyy
    /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-mm-dd
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // d/m/yyyy
  ];

  for (const formato of formatos) {
    const match = dataStr.match(formato);
    if (match) {
      if (match[3].length === 4) {
        // yyyy ou último é o ano
        const [, p1, p2, p3] = match;
        if (p1.length === 4) {
          // yyyy-mm-dd
          return `${p1}-${p2.padStart(2, "0")}-${p3.padStart(2, "0")}`;
        } else {
          // dd/mm/yyyy
          return `${p3}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
        }
      }
    }
  }

  return null;
}

function parseValor(valorStr: string): number | null {
  // Remove espaços
  let valor = valorStr.trim();

  // Remover $ e símbolos de moeda
  valor = valor.replace(/[$R]/g, "");

  // Converter brasileiro (1.250,00) para (1250.00)
  if (valor.includes(",")) {
    const temPonto = valor.includes(".");
    if (temPonto) {
      // 1.250,00 → remover ponto, converter vírgula para ponto
      valor = valor.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,00 → converter vírgula para ponto
      valor = valor.replace(",", ".");
    }
  }

  // Aceitar negativo
  const negativo = valor.includes("-");
  const numero = parseFloat(valor);

  if (isNaN(numero)) return null;

  return negativo ? -numero : numero;
}
