import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  X,
} from "lucide-react";
import type { AssistantProposal } from "../../domain/types";
import { captureOf, pendingProposals, useFarm } from "../../state/store";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FactNatureChip,
  PageHeader,
  SectionTitle,
  inputCls,
} from "../../components/ui";
import { ReviewSheet } from "./ReviewSheet";
import { CorrectSheet, type CorrectionTarget } from "../leite/CorrectSheet";
import {
  captureAttachmentUrl,
  captureImageReferences,
  confirmationAt,
  confirmedHistorySummary,
  KIND_LABEL,
  formatWhen,
  sortAssistantHistory,
} from "./helpers";
import { Link, useNavigate } from "react-router-dom";
import { BulkCaptureComposer } from "./BulkCaptureComposer";

interface Toast {
  message: string;
}

type PendingFilter = "todas" | "com_pendencias";
type PendingSort = "antigas" | "pendencias";

export default function AssistentePage() {
  const { state } = useFarm();
  const navigate = useNavigate();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("todas");
  const [pendingSort, setPendingSort] = useState<PendingSort>("antigas");

  const pending = useMemo(() => {
    const filtered = pendingProposals(state).filter((proposal) => {
      if (pendingFilter === "todas") return true;
      return proposal.issues.length > 0;
    });

    return [...filtered].sort((left, right) => {
      if (pendingSort === "pendencias" && left.issues.length !== right.issues.length) {
        return right.issues.length - left.issues.length;
      }
      const leftAt = captureOf(state, left.captureId)?.createdAt ?? "";
      const rightAt = captureOf(state, right.captureId)?.createdAt ?? "";
      return leftAt.localeCompare(rightAt) || left.id.localeCompare(right.id);
    });
  }, [state, pendingFilter, pendingSort]);
  const history = sortAssistantHistory(state, state.proposals);

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
        action={<Link to="/galeria" className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-pasture-100 text-pasture-700 px-3 text-sm font-semibold">Abrir Galeria</Link>}
      />

      {/* Legenda das naturezas de dado */}
      <div className="flex items-center gap-1.5 mb-5 text-xs text-ink-faint flex-wrap">
        <FactNatureChip nature="captura" />
        <ArrowRight size={13} />
        <FactNatureChip nature="proposta" />
        <ArrowRight size={13} />
        <FactNatureChip nature="registro" />
      </div>

      <BulkCaptureComposer />
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Propostas pendentes */}
        <section>
          <SectionTitle>Propostas aguardando Revisão</SectionTitle>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <label className="flex-1 min-w-40">
              <span className="block text-xs font-medium text-ink-soft mb-1">Mostrar</span>
              <select
                className={inputCls}
                value={pendingFilter}
                onChange={(event) => setPendingFilter(event.target.value as PendingFilter)}
              >
                <option value="todas">Todas as Propostas</option>
                <option value="com_pendencias">Com pendências</option>
              </select>
            </label>
            <label className="flex-1 min-w-40">
              <span className="block text-xs font-medium text-ink-soft mb-1">Ordenar por</span>
              <select
                className={inputCls}
                value={pendingSort}
                onChange={(event) => setPendingSort(event.target.value as PendingSort)}
              >
                <option value="antigas">Mais antigas</option>
                <option value="pendencias">Mais pendências</option>
              </select>
            </label>
          </div>
          {pending.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title={pendingFilter === "com_pendencias" ? "Nenhuma proposta com pendência" : "Nenhuma proposta pendente"}
                hint={pendingFilter === "com_pendencias" ? "As propostas pendentes atuais não têm pendências sinalizadas." : "Novas capturas geram propostas para revisão antes de virar Registro."}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => {
                const cap = captureOf(state, p.captureId);
                const photos = cap ? captureImageReferences(cap) : [];
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
                      <>
                        {(cap.text ?? cap.extractedText) && <p className="text-sm text-ink-soft italic mt-1 line-clamp-2">“{cap.text ?? cap.extractedText}”</p>}
                        {photos.map((id) => <a key={id} href={captureAttachmentUrl(cap.id, id)} target="_blank" rel="noreferrer" className="inline-block text-xs text-pasture-700 underline underline-offset-2 mt-1">Abrir foto original</a>)}
                      </>
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
                const cap = captureOf(state, p.captureId);
                const photos = cap ? captureImageReferences(cap) : [];
                const summary = confirmed ? confirmedHistorySummary(state, p) : null;
                const confirmedAt = confirmed ? confirmationAt(state, p.id) : undefined;
                const controlPath = summary?.control?.path;
                const production = summary?.production;
                const collection = summary?.collection;
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
                      {summary?.title ?? p.title}
                    </p>
                    {summary && <p className="text-sm text-ink-soft mt-1">{summary.detail}</p>}
                    {cap && (
                      <div className="flex items-center gap-3 flex-wrap mt-2">
                        {photos.map((id) => <a key={id} href={captureAttachmentUrl(cap.id, id)} target="_blank" rel="noreferrer" className="text-xs text-pasture-700 underline underline-offset-2">Abrir foto original</a>)}
                        <span className="text-xs text-ink-faint">
                          Capturada {formatWhen(cap.createdAt)}
                        </span>
                        {confirmedAt && (
                          <span className="text-xs text-ink-faint">
                            Confirmada {formatWhen(confirmedAt)}
                          </span>
                        )}
                      </div>
                    )}
                    {!confirmed && (
                      <p className="text-sm text-ink-faint mt-1 italic">
                        {p.dismissReason
                          ? `Motivo: ${p.dismissReason}`
                          : "Descartada sem motivo informado."}
                      </p>
                    )}
                    {confirmed && summary && (
                      <div className="flex items-center justify-end gap-2 mt-3">
                        {controlPath && (
                          <Button
                            variant="secondary"
                            onClick={() => navigate(controlPath)}
                          >
                            Abrir controle do dia
                          </Button>
                        )}
                        {production && (
                          <Button
                            variant="secondary"
                            onClick={() => setCorrectionTarget({ kind: "producao", rec: production })}
                          >
                            Corrigir
                          </Button>
                        )}
                        {collection && (
                          <Button
                            variant="secondary"
                            onClick={() => setCorrectionTarget({ kind: "coleta", rec: collection })}
                          >
                            Corrigir
                          </Button>
                        )}
                      </div>
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

      {correctionTarget && (
        <CorrectSheet
          key={correctionTarget.rec.id}
          target={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
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
