import type { Animal } from "../../domain/types";

/**
 * Reconhecimento de Animais a partir do rótulo ditado/escrito na Captura.
 * Tolerante a caixa e acentos; nunca funde automaticamente em caso de dúvida —
 * candidatos viram sugestões de um toque na Revisão (US-HE-02 / US-MI-03).
 */

/** Normaliza para comparar: minúsculas, sem acentos, espaços colapsados. */
export function normalizeLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacríticos combinantes (U+0300–U+036F)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type MatchStatus = "exata" | "provavel" | "nao";

export interface Suggestion {
  animal: Animal;
  /** Onde o rótulo casou: no nome ou no brinco. */
  via: "nome" | "brinco";
  /**
   * Trecho normalizado do nome/brinco que casou. Como `normalizeLabel`
   * preserva o comprimento de caracteres acentuados pré-compostos, a Revisão
   * localiza o trecho no texto original pelo índice e o destaca.
   */
  highlight: string;
}

export interface MatchResult {
  status: MatchStatus;
  /** Vínculo proposto (exata/provável); null quando não reconhecido. */
  animal: Animal | null;
  /** Candidatos para os chips "Você quis dizer…", por relevância (máx. 3). */
  suggestions: Suggestion[];
}

const digitsOf = (s: string) => (s.match(/\d+/g) ?? []).join("");

/** Palavras que só identificam o tipo do rótulo, nunca um Animal. */
const STOP_WORDS = new Set(["brinco", "vaca", "numero", "n"]);

/**
 * Distância de edição ≤ 1 entre palavras curtas (erro de digitação comum ao
 * transcrever do caderno: "mimoza" → "Mimosa"). Limitada a palavras curtas
 * para custo desprezível.
 */
function nearWord(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1 || la < 3 || lb < 3 || la > 12 || lb > 12) return false;
  // Uma linha de Levenshtein com corte antecipado.
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > 1) return false;
    prev = cur;
  }
  return prev[lb] <= 1;
}

interface Candidate {
  animal: Animal;
  score: number;
  via: "nome" | "brinco";
  highlight: string;
}

export function matchAnimalLabel(rawLabel: string, animals: Animal[]): MatchResult {
  const active = animals.filter((a) => a.status === "ativo");
  const norm = normalizeLabel(rawLabel);
  if (!norm) return { status: "nao", animal: null, suggestions: [] };

  // 1) Exata: nome ou brinco idênticos (caixa/acentos tolerados).
  const exact = active.find(
    (a) =>
      normalizeLabel(a.name) === norm ||
      (a.tag !== undefined && a.tag !== "" && normalizeLabel(a.tag) === norm)
  );
  if (exact) return { status: "exata", animal: exact, suggestions: [] };

  const byId = new Map<string, Candidate>();
  /** Soma pontos; guarda o melhor via/highlight (regra mais forte que casou). */
  const bump = (a: Animal, pts: number, via: "nome" | "brinco", highlight: string) => {
    const cur = byId.get(a.id);
    if (!cur) {
      byId.set(a.id, { animal: a, score: pts, via, highlight });
      return;
    }
    cur.score += pts;
    if (pts > 0 && highlight && !cur.highlight) {
      cur.via = via;
      cur.highlight = highlight;
    }
  };

  // 2) Dígitos: "brinco 300" → brinco B-300, ou dígitos no nome.
  const digits = digitsOf(norm);
  if (digits) {
    for (const a of active) {
      const tagDigits = digitsOf(a.tag ?? "");
      if (tagDigits && (tagDigits === digits || tagDigits.endsWith(digits)))
        bump(a, 3, "brinco", digits);
      else if (digitsOf(a.name) && digitsOf(a.name) === digits)
        bump(a, 2, "nome", digits);
    }
  }

  // 3) Nome aproximado: prefixo, contenção de palavras ou erro de digitação.
  const words = norm
    .split(" ")
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP_WORDS.has(w));
  for (const a of active) {
    const an = normalizeLabel(a.name);
    const nameWords = an.split(" ");
    const prefix = words.find(
      (w) => an.startsWith(w) || (w.length > an.length && w.startsWith(an))
    );
    if (prefix) {
      bump(a, 2, "nome", prefix.length <= an.length ? prefix : an);
      continue;
    }
    const inside = words.find((w) => an.includes(w));
    if (inside) {
      bump(a, 1, "nome", inside);
      continue;
    }
    // Erro curto de digitação: palavra quase igual a uma palavra do nome.
    const typo = words.find((w) => nameWords.some((nw) => nearWord(w, nw)));
    if (typo) {
      const closest = nameWords.find((nw) => nearWord(typo, nw)) ?? typo;
      bump(a, 1, "nome", closest);
    }
  }

  const ranked = [...byId.values()].sort(
    (x, y) => y.score - x.score || x.animal.name.localeCompare(y.animal.name, "pt-BR")
  );
  const suggestions = ranked
    .slice(0, 3)
    .map(({ animal, via, highlight }) => ({ animal, via, highlight }));

  // Provável: um único candidato forte e destacado — ainda exige um toque.
  if (
    ranked.length >= 1 &&
    ranked[0].score >= 3 &&
    (ranked.length === 1 || ranked[1].score < ranked[0].score)
  ) {
    return { status: "provavel", animal: ranked[0].animal, suggestions };
  }
  return { status: "nao", animal: null, suggestions };
}

/**
 * Palpite inicial (editável) para o cadastro inline a partir do rótulo cru.
 * "brinco 300" → nome "300", brinco "300"; "mimosa" → nome "Mimosa".
 */
export function guessNewAnimal(rawLabel: string): { name: string; tag: string } {
  const clean = rawLabel.trim().replace(/\s+/g, " ");
  const digits = digitsOf(clean);
  const withoutStop = clean
    .split(" ")
    .filter((w) => !STOP_WORDS.has(normalizeLabel(w)))
    .join(" ")
    .trim();
  const base = withoutStop || clean;
  return {
    name: base.replace(/^./, (c) => c.toUpperCase()),
    tag: digits,
  };
}
