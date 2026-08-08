import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Camera,
  CheckCircle2,
  ImagePlus,
  Images,
  Inbox,
  LoaderCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { AssistantCapture, AssistantCaptureAttachment, AssistantProposal } from "../../domain/types";
import { captureOf, pendingProposals, useFarm } from "../../state/store";
import {
  createAssistantTextCapture,
  interpretPersistedAssistantCapture,
  readAssistantPhoto,
  uploadAssistantPhoto,
} from "../../state/api";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FactNatureChip,
  InlineError,
  PageHeader,
  SectionTitle,
  Sheet,
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

interface Toast {
  message: string;
}

export default function AssistentePage() {
  const { state, dispatch, syncAssistantInterpretation } = useFarm();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCaptureId, setPhotoCaptureId] = useState<string | null>(null);
  const [photoStage, setPhotoStage] = useState<"idle" | "uploading" | "reading" | "interpreting">("idle");
  const [storedAttachment, setStoredAttachment] = useState<AssistantCaptureAttachment | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const pending = pendingProposals(state);
  const history = sortAssistantHistory(state, state.proposals);
  const savedAttachments = state.captures.flatMap((capture) => (capture.attachments ?? []).filter((attachment) => !attachment.deletedAt));
  const storedNeedsText = Boolean(storedAttachment && storedAttachment.kind !== "imagem" && !text.trim());

  const submit = async () => {
    const t = text.trim();
    if (!t || interpreting) return;
    setInterpreting(true);
    setInterpretError(null);
    try {
      const capture = await createAssistantTextCapture(t);
      const result = await interpretPersistedAssistantCapture(capture.id);
      syncAssistantInterpretation(result);
      setText("");
    } catch (error) {
      setInterpretError(error instanceof Error ? error.message : "Não foi possível gerar a Proposta.");
    } finally {
      setInterpreting(false);
    }
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoCaptureId(null);
    setPhotoError(null);
    setPhotoStage("idle");
    setStoredAttachment(null);
  };

  const selectStoredAttachment = (attachment: AssistantCaptureAttachment) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoCaptureId(null);
    setStoredAttachment(attachment);
    setPhotoError(null);
    setGalleryOpen(false);
    setPhotoStage("idle");
  };

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setPhotoError("Escolha uma foto JPEG, PNG ou WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("A foto precisa ter no máximo 10 MB.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoCaptureId(null);
    setPhotoError(null);
    setPhotoStage("idle");
  };

  const submitPhoto = async () => {
    if (!photo || photoStage !== "idle") return;
    setPhotoError(null);
    try {
      let captureId = photoCaptureId;
      let needsRead = true;
      if (!captureId) {
        setPhotoStage("uploading");
        const capture = await uploadAssistantPhoto(photo, text);
        captureId = capture.id;
        needsRead = capture.extractedText === null;
        setPhotoCaptureId(captureId);
      }
      // OCR é uma etapa explícita da foto, mesmo com uma observação digitada.
      // Em erro, a mesma foto/captura fica disponível para retry sem upload.
      if (needsRead) {
        setPhotoStage("reading");
        await readAssistantPhoto(captureId);
      }
      setPhotoStage("interpreting");
      const result = await interpretPersistedAssistantCapture(captureId);
      syncAssistantInterpretation(result);
      setText("");
      clearPhoto();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Não foi possível ler a foto.");
      setPhotoStage("idle");
    }
  };

  const submitStoredAttachment = async () => {
    if (!storedAttachment || photoStage !== "idle") return;
    if (storedNeedsText) {
      setPhotoError("Para reutilizar PDF ou áudio, escreva uma observação no campo acima para o Assistente interpretar.");
      return;
    }
    setPhotoError(null);
    try {
      setPhotoStage("uploading");
      const outcome = await dispatch({
        type: "CreateAssistantCaptureFromAttachment",
        attachmentId: storedAttachment.id,
        text: text.trim() || undefined,
      });
      if (!outcome.ok) throw new Error(outcome.message);
      const capture = (outcome.result as { capture: AssistantCapture }).capture;
      syncAssistantInterpretation({ capture, proposals: [] });
      if (storedAttachment.kind === "imagem" && !capture.extractedText) {
        setPhotoStage("reading");
        await readAssistantPhoto(capture.id);
      }
      setPhotoStage("interpreting");
      const result = await interpretPersistedAssistantCapture(capture.id);
      syncAssistantInterpretation(result);
      setText("");
      clearPhoto();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Não foi possível usar o arquivo.");
      setPhotoStage("idle");
    }
  };

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

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
        <input
          ref={cameraInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          aria-label="Tirar foto da anotação ou comprovante"
          onChange={(e) => {
            choosePhoto(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={galleryInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Escolher foto da galeria"
          onChange={(e) => {
            choosePhoto(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        {photoPreview ? (
          <div className="mt-3 rounded-2xl border border-black/10 bg-ink/[0.02] p-3">
            <div className="flex gap-3 items-start">
              <img
                src={photoPreview}
                alt="Prévia da foto selecionada"
                className="size-20 rounded-xl object-cover border border-black/10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{photo?.name}</p>
                <p className="text-xs text-ink-faint mt-0.5">
                  {photo ? `${Math.ceil(photo.size / 1024)} KB` : "Foto pronta para envio"}
                </p>
                <p className="text-xs text-ink-soft mt-2">
                  A imagem será lida primeiro; a Proposta continua exigindo sua revisão.
                </p>
              </div>
              <button
                type="button"
                onClick={clearPhoto}
                disabled={photoStage !== "idle"}
                aria-label="Remover foto selecionada"
                className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-ink-soft hover:bg-ink/5 disabled:opacity-50"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ) : storedAttachment ? (
          <div className="mt-3 rounded-2xl border border-black/10 bg-ink/[0.02] p-3">
            <div className="flex gap-3 items-center">
              <div className="size-20 rounded-xl bg-paper-sunken grid place-items-center text-ink-faint shrink-0">
                {storedAttachment.kind === "imagem" ? <img src={captureAttachmentUrl(storedAttachment.captureId, storedAttachment.id)} alt={storedAttachment.name ?? "Arquivo salvo"} className="size-full object-cover rounded-xl" /> : storedAttachment.kind === "audio" ? <AudioLines size={26} /> : <Images size={26} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{storedAttachment.name ?? "Arquivo salvo"}</p>
                <p className="text-xs text-ink-soft mt-1">Arquivo salvo na Galeria · será reutilizado como nova Captura.</p>
              </div>
              <button type="button" onClick={clearPhoto} disabled={photoStage !== "idle"} aria-label="Remover arquivo salvo" className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-ink-soft hover:bg-ink/5 disabled:opacity-50"><Trash2 size={17} /></button>
            </div>
            {storedNeedsText && <p className="text-xs text-review-700 mt-2">PDFs e áudios são guardados como fonte; escreva uma observação acima para gerar a Proposta.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <Button variant="secondary" type="button" onClick={() => cameraInput.current?.click()}>
              <Camera size={16} /> Tirar foto
            </Button>
            <Button variant="secondary" type="button" onClick={() => galleryInput.current?.click()}>
              <ImagePlus size={16} /> Galeria
            </Button>
            <Button variant="secondary" type="button" onClick={() => setGalleryOpen(true)}>
              <Images size={16} /> Salvos
            </Button>
          </div>
        )}
        <p className="text-xs text-ink-faint mt-2">
          Foto de anotação ou comprovante: JPEG, PNG ou WEBP, até 10 MB.
        </p>
        {interpretError && <div className="mt-3"><InlineError>{interpretError}</InlineError></div>}
        {photoError && <div className="mt-3"><InlineError>{photoError}</InlineError></div>}
        <div className="flex items-center gap-2 mt-3">
          {(photo || storedAttachment) && (
            <Button
              variant="secondary"
              disabled={photoStage !== "idle" || storedNeedsText}
              onClick={() => void (photo ? submitPhoto() : submitStoredAttachment())}
            >
              {photoStage !== "idle" && <LoaderCircle size={15} className="animate-spin" />}
              {photoStage === "uploading" ? "Preparando arquivo…" : photoStage === "reading" ? "Lendo arquivo…" : photoStage === "interpreting" ? "Interpretando…" : photoCaptureId ? "Tentar novamente" : "Usar arquivo"}
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={!text.trim() || interpreting || photoStage !== "idle" || Boolean(photo) || Boolean(storedAttachment)}
            onClick={submit}
          >
            <Send size={15} /> {interpreting ? "Interpretando…" : "Gerar proposta"}
          </Button>
        </div>
      </Card>

      <SavedAttachmentSheet
        open={galleryOpen}
        attachments={savedAttachments}
        onClose={() => setGalleryOpen(false)}
        onSelect={selectStoredAttachment}
      />

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

function SavedAttachmentSheet({
  open,
  attachments,
  onClose,
  onSelect,
}: {
  open: boolean;
  attachments: AssistantCaptureAttachment[];
  onClose: () => void;
  onSelect: (attachment: AssistantCaptureAttachment) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Usar arquivo salvo">
      {attachments.length === 0 ? (
        <EmptyState icon={<Images size={28} />} title="Nenhum arquivo salvo" hint="Adicione fotos ou documentos na Galeria para reutilizá-los aqui." />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft mb-3">Escolha uma Captura já guardada. O arquivo será usado em uma nova Revisão.</p>
          {attachments.map((attachment) => (
            <button key={attachment.id} type="button" onClick={() => onSelect(attachment)} className="w-full flex items-center gap-3 rounded-xl border border-black/5 p-3 text-left hover:bg-ink/[0.03] min-h-[64px]">
              <div className="size-12 rounded-lg bg-paper-sunken grid place-items-center overflow-hidden shrink-0">
                {attachment.kind === "imagem" ? <img src={captureAttachmentUrl(attachment.captureId, attachment.id)} alt="" className="size-full object-cover" /> : attachment.kind === "audio" ? <AudioLines size={21} className="text-ink-faint" /> : <Images size={21} className="text-ink-faint" />}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{attachment.name ?? "Arquivo salvo"}</span>
                <span className="block text-xs text-ink-faint mt-0.5">{attachment.kind === "imagem" ? "Imagem" : attachment.kind === "audio" ? "Áudio" : "Documento"}</span>
              </span>
              <ArrowRight size={16} className="text-ink-faint" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
