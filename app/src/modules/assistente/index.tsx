import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Hash,
  Inbox,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { AssistantProposal } from "../../domain/types";
import { captureOf, pendingProposals, useFarm } from "../../state/store";
import { interpretAssistantCapture } from "../../state/api";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FactNatureChip,
  InlineError,
  PageHeader,
  SectionTitle,
} from "../../components/ui";
import { ReviewSheet } from "./ReviewSheet";
import { KIND_LABEL, formatWhen } from "./helpers";

interface Toast {
  message: string;
}

export default function AssistentePage() {
  const { state, dispatch } = useFarm();
  const [text, setText] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);

  const pending = pendingProposals(state);
  const history = state.proposals.filter((p) => p.status !== "pendente");

  const submit = async () => {
    const t = text.trim();
    if (!t || interpreting) return;
    setInterpreting(true);
    setInterpretError(null);
    try {
      const proposals = await interpretAssistantCapture(t);
      const outcome = await dispatch({ type: "CreateAssistantCapture", text: t, proposals });
      if (!outcome.ok) {
        setInterpretError(outcome.message);
        return;
      }
      setText("");
    } catch (error) {
      setInterpretError(error instanceof Error ? error.message : "Não foi possível gerar a Proposta.");
    } finally {
      setInterpreting(false);
    }
  };

  // Fila: após a Confirmação, avança para a próxima Proposta pendente.
  const handleConfirmed = (confirmed: AssistantProposal, summary: string) => {
    setToast({ message: summary });
    const next = pendingProposals(state).find((p) => p.id !== confirmed.id);
    setReviewId(next ? next.id : null);
  };

  // Toast compacto do queue mode: some sozinho.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Assistente"
        subtitle="Escreva o que aconteceu; revise antes de virar Registro."
      />

      {/* Legenda das naturezas de dado */}
      <div className="flex items-center gap-1.5 mb-5 text-xs text-ink-faint flex-wrap">
        <FactNatureChip nature="captura" />
        <ArrowRight size={13} />
        <FactNatureChip nature="proposta" />
        <ArrowRight size={13} />
        <FactNatureChip nature="registro" />
      </div>

      {/* Composer de Captura */}
      <Card className="p-4 md:p-5 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-pasture-600" />
          <span className="text-sm font-semibold">Nova captura</span>
          <span className="ml-auto">
            <FactNatureChip nature="captura" />
          </span>
        </div>
        <textarea
          className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-base outline-none focus:border-pasture-500 focus:ring-2 focus:ring-pasture-100 transition min-h-24"
          placeholder="Ex.: hoje a produção foi 348 litros e meio"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Texto da captura"
        />
        <p className="text-xs text-ink-faint mt-2">
          A Captura por texto está disponível. Áudio e foto aparecerão quando
          transcrição e leitura de imagem estiverem conectadas ao mesmo pipeline.
        </p>
        {interpretError && <div className="mt-3"><InlineError>{interpretError}</InlineError></div>}
        <div className="flex items-center gap-2 mt-3">
          <Button
            className="ml-auto"
            disabled={!text.trim() || interpreting}
            onClick={submit}
          >
            <Send size={15} /> {interpreting ? "Interpretando…" : "Gerar proposta"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Propostas pendentes */}
        <section>
          <SectionTitle>Propostas aguardando Revisão</SectionTitle>
          {pending.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title="Nenhuma proposta pendente"
                hint="Novas capturas geram propostas para revisão antes de virar Registro."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => {
                const cap = captureOf(state, p.captureId);
                return (
                  <Card key={p.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <FactNatureChip nature="proposta" />
                      <Chip tone="neutro">{KIND_LABEL[p.kind]}</Chip>
                      {p.issues.length > 0 && (
                        <Chip tone="pendente">
                          {p.issues.length}{" "}
                          {p.issues.length === 1 ? "pendência" : "pendências"}
                        </Chip>
                      )}
                    </div>
                    <p className="font-medium">{p.title}</p>
                    {cap && (
                      <p className="text-sm text-ink-soft italic mt-1 line-clamp-2">
                        “{cap.text}”
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      {cap && (
                        <span className="text-xs text-ink-faint">
                          {formatWhen(cap.createdAt)}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        className="ml-auto"
                        onClick={() => setReviewId(p.id)}
                      >
                        Revisar
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Histórico */}
        <section>
          <SectionTitle>Histórico</SectionTitle>
          {history.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox size={28} />}
                title="Nada por aqui ainda"
                hint="Propostas confirmadas e descartadas aparecem nesta lista."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {history.map((p) => {
                const confirmed = p.status === "confirmada";
                return (
                  <Card
                    key={p.id}
                    className={`p-4 ${confirmed ? "" : "opacity-75"}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {confirmed ? (
                        <FactNatureChip nature="registro" />
                      ) : (
                        <Chip tone="neutro">Proposta descartada</Chip>
                      )}
                      <Chip tone="neutro">{KIND_LABEL[p.kind]}</Chip>
                    </div>
                    <p
                      className={`font-medium ${
                        confirmed ? "" : "text-ink-soft"
                      }`}
                    >
                      {p.title}
                    </p>
                    {confirmed && p.confirmedRecordIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.confirmedRecordIds.map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 text-xs text-pasture-700 underline underline-offset-2"
                          >
                            <Hash size={11} />
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                    {!confirmed && (
                      <p className="text-sm text-ink-faint mt-1 italic">
                        {p.dismissReason
                          ? `Motivo: ${p.dismissReason}`
                          : "Descartada sem motivo informado."}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Fluxo de Revisão (tela cheia) */}
      {reviewId && (
        <ReviewSheet
          key={reviewId}
          proposalId={reviewId}
          onClose={() => setReviewId(null)}
          onConfirmed={handleConfirmed}
        />
      )}

      {/* Aviso de sucesso da Confirmação */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-4 z-[60] flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-pasture-200 bg-paper-card shadow-lg px-4 py-3 max-w-md w-full sm:w-auto">
            <FactNatureChip nature="registro" />
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              aria-label="Fechar aviso"
              className="p-2 -mr-1 text-ink-soft min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
