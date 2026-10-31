import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Camera,
  Check,
  ImagePlus,
  Images,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  AssistantAttachmentCategory,
  AssistantCapture,
  AssistantCaptureAttachment,
  ProposalKind,
} from "../../domain/types";
import { useFarm } from "../../state/store";
import {
  createAssistantTextCapture,
  interpretPersistedAssistantCapture,
  readAssistantPhoto,
  uploadAssistantPhoto,
} from "../../state/api";
import { Button, Card, FactNatureChip, InlineError, Sheet, inputCls } from "../../components/ui";
import { ImageViewer } from "../../components/ImageViewer";
import { today } from "../../lib/dates";
import { captureAttachmentUrl } from "./helpers";
import { buildBulkCaptureText, categoryForProposalKinds } from "./bulkCapture";

type Stage = "idle" | "uploading" | "reading" | "interpreting" | "done" | "error";
type ContextKind = "auto" | "controle_leiteiro" | "producao_diaria";
type CategoryMode = "automatic" | "manual";

type WorkItem = {
  key: string;
  file?: File;
  attachment?: AssistantCaptureAttachment;
  preview: string;
  name: string;
  stage: Stage;
  captureId?: string;
  classifiedAttachment?: AssistantCaptureAttachment;
  proposalKinds?: ProposalKind[];
  error?: string;
};

const CATEGORY_LABEL: Record<AssistantAttachmentCategory, string> = {
  controle_leiteiro: "Controle leiteiro",
  producao_diaria: "Produção diária",
  coleta: "Coleta",
  comprovante: "Comprovante",
  nota_fiscal: "Nota fiscal",
  financeiro: "Financeiro",
  mapa: "Mapa",
  outro: "Outro",
};

const stageLabel: Record<Stage, string> = {
  idle: "Pronta",
  uploading: "Enviando…",
  reading: "Lendo…",
  interpreting: "Classificando…",
  done: "Proposta criada",
  error: "Falhou",
};

export function BulkCaptureComposer() {
  const { state, dispatch, syncAssistantInterpretation } = useFarm();
  const location = useLocation();
  const navigate = useNavigate();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<WorkItem[]>([]);
  const [text, setText] = useState("");
  const [items, setItems] = useState<WorkItem[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("automatic");
  const [manualCategory, setManualCategory] = useState<AssistantAttachmentCategory>("controle_leiteiro");
  const [contextKind, setContextKind] = useState<ContextKind>("auto");
  const [date, setDate] = useState(today);
  const [groupId, setGroupId] = useState("");
  const [shift, setShift] = useState<"manha" | "tarde" | "unica">("manha");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [textCaptureId, setTextCaptureId] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);
  const importedRouteSelection = useRef(false);

  const attachments = useMemo(
    () => state.captures.flatMap((capture) => (capture.attachments ?? []).filter((attachment) => !attachment.deletedAt)),
    [state.captures],
  );

  useEffect(() => {
    if (importedRouteSelection.current || attachments.length === 0) return;
    const routeState = location.state as { attachmentIds?: string[] } | null;
    const queryId = new URLSearchParams(location.search).get("attachment");
    const ids = [...(routeState?.attachmentIds ?? []), ...(queryId ? [queryId] : [])];
    if (ids.length === 0) return;
    importedRouteSelection.current = true;
    const selected = attachments.filter((attachment) => ids.includes(attachment.id));
    if (selected.length > 0) addStored(selected);
    navigate(location.pathname, { replace: true, state: null });
  }, [attachments, location.pathname, location.search, location.state, navigate]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    for (const item of itemsRef.current) if (item.file) URL.revokeObjectURL(item.preview);
  }, []);

  function addFiles(files: File[]) {
    const valid: WorkItem[] = [];
    const errors: string[] = [];
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        errors.push(`${file.name}: use JPEG, PNG ou WEBP.`);
      } else if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: máximo de 10 MB.`);
      } else {
        valid.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), name: file.name, stage: "idle" });
      }
    }
    setItems((current) => [...current, ...valid]);
    setBatchError(errors.length ? errors.join(" ") : null);
  }

  function addStored(selected: AssistantCaptureAttachment[]) {
    setItems((current) => {
      const existing = new Set(current.flatMap((item) => item.attachment ? [item.attachment.id] : []));
      return [
        ...current,
        ...selected.filter((attachment) => !existing.has(attachment.id)).map((attachment) => ({
          key: `stored:${attachment.id}`,
          attachment,
          preview: captureAttachmentUrl(attachment.captureId, attachment.id),
          name: attachment.name ?? "Arquivo salvo",
          stage: "idle" as const,
        })),
      ];
    });
  }

  function removeItem(key: string) {
    setItems((current) => {
      const removed = current.find((item) => item.key === key);
      if (removed?.file) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.key !== key);
    });
  }

  function patchItem(key: string, patch: Partial<WorkItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function contextText() {
    const group = state.groups.find((candidate) => candidate.id === groupId);
    if (contextKind === "auto") return buildBulkCaptureText({ kind: "auto" }, text);
    if (contextKind === "producao_diaria") return buildBulkCaptureText({ kind: "producao_diaria", date }, text);
    return buildBulkCaptureText({ kind: "controle_leiteiro", date, groupName: group?.name ?? "não selecionado", shift }, text);
  }

  async function submitTextOnly() {
    if (textBusy) return;
    const source = contextText();
    if (!source) {
      setBatchError("Escreva o que aconteceu ou escolha um contexto para gerar a Proposta.");
      return;
    }
    if (contextKind !== "auto" && !date) {
      setBatchError("Informe a data do Registro.");
      return;
    }
    if (contextKind === "controle_leiteiro" && !groupId) {
      setBatchError("Selecione o Lote do Controle leiteiro.");
      return;
    }
    setTextBusy(true);
    setBatchError(null);
    try {
      let captureId = textCaptureId;
      if (!captureId) {
        const capture = await createAssistantTextCapture(source);
        captureId = capture.id;
        setTextCaptureId(captureId);
      }
      const interpreted = await interpretPersistedAssistantCapture(captureId);
      syncAssistantInterpretation(interpreted);
      setText("");
      setTextCaptureId(null);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Não foi possível gerar a Proposta.");
    } finally {
      setTextBusy(false);
    }
  }

  async function classifyAttachment(target: AssistantCaptureAttachment | undefined, kinds: ProposalKind[]) {
    if (!target) return;
    const category = categoryMode === "manual" ? manualCategory : categoryForProposalKinds(kinds);
    const result = await dispatch({
      type: "UpdateAssistantAttachment",
      attachmentId: target.id,
      name: target.name ?? "Arquivo da Captura",
      category,
    });
    if (!result.ok) throw new Error(result.message);
  }

  async function processItem(item: WorkItem) {
    try {
      if (item.proposalKinds) {
        await classifyAttachment(item.classifiedAttachment, item.proposalKinds);
        patchItem(item.key, { stage: "done", error: undefined });
        return;
      }
      if (item.attachment && item.attachment.kind !== "imagem" && !text.trim()) {
        throw new Error("Escreva uma observação para interpretar PDF ou áudio.");
      }
      let captureId = item.captureId;
      let capture: AssistantCapture;
      if (!captureId) {
        patchItem(item.key, { stage: "uploading", error: undefined });
        if (item.file) {
          capture = await uploadAssistantPhoto(item.file, contextText());
        } else if (item.attachment) {
          const outcome = await dispatch({
            type: "CreateAssistantCaptureFromAttachment",
            attachmentId: item.attachment.id,
            text: contextText(),
          });
          if (!outcome.ok) throw new Error(outcome.message);
          capture = (outcome.result as { capture: AssistantCapture }).capture;
          syncAssistantInterpretation({ capture, proposals: [] });
        } else {
          throw new Error("Arquivo não encontrado.");
        }
        captureId = capture.id;
        patchItem(item.key, { captureId });
      }
      const isImage = Boolean(item.file || item.attachment?.kind === "imagem");
      if (isImage) {
        patchItem(item.key, { stage: "reading" });
        capture = await readAssistantPhoto(captureId);
      }
      patchItem(item.key, { stage: "interpreting" });
      const interpreted = await interpretPersistedAssistantCapture(captureId);
      syncAssistantInterpretation(interpreted);
      const proposalKinds = interpreted.proposals.map((proposal) => proposal.kind);
      const classifiedAttachment = interpreted.capture.attachments?.[0] ?? item.attachment;
      patchItem(item.key, { proposalKinds, classifiedAttachment });
      await classifyAttachment(classifiedAttachment, proposalKinds);
      patchItem(item.key, { stage: "done", error: undefined });
    } catch (error) {
      patchItem(item.key, { stage: "error", error: error instanceof Error ? error.message : "Não foi possível processar esta foto." });
    }
  }

  async function processBatch() {
    if (busy) return;
    if (contextKind === "controle_leiteiro" && !groupId) {
      setBatchError("Selecione o Lote do Controle leiteiro.");
      return;
    }
    if (contextKind !== "auto" && !date) {
      setBatchError("Informe a data comum das fotos.");
      return;
    }
    setBusy(true);
    setBatchError(null);
    const pending = items.filter((item) => item.stage === "idle" || item.stage === "error");
    for (const item of pending) await processItem(item);
    setBusy(false);
  }

  const pendingCount = items.filter((item) => item.stage === "idle" || item.stage === "error").length;
  const completedCount = items.filter((item) => item.stage === "done").length;
  const selectedGroup = state.groups.find((group) => group.id === groupId);
  const hasPreservedCapture = items.some((item) => item.stage === "error" && item.captureId);

  return <>
    <Card className="p-4 md:p-5 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-pasture-600" />
        <span className="text-sm font-semibold">Nova captura em lote</span>
        <span className="ml-auto"><FactNatureChip nature="captura" /></span>
      </div>

      <textarea disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture} className="w-full rounded-xl border border-ink/10 bg-paper-card px-3.5 py-2.5 text-base outline-none focus:border-pasture-500 focus:ring-2 focus:ring-pasture-100 transition min-h-20 disabled:opacity-60" placeholder="Escreva um fato ou uma observação comum para todas as fotos" value={text} onChange={(event) => setText(event.target.value)} />
      {textCaptureId && <p className="text-xs text-review-700 mt-2">A Captura já foi preservada. A nova tentativa reutilizará exatamente este texto e contexto.</p>}
      {hasPreservedCapture && <p className="text-xs text-review-700 mt-2">As Capturas que falharam já foram preservadas. A nova tentativa mantém o contexto original e não envia os arquivos novamente.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <label><span className="block text-xs font-medium text-ink-soft mb-1">O que estas fotos mostram?</span><select disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture} className={inputCls} value={contextKind} onChange={(event) => setContextKind(event.target.value as ContextKind)}><option value="auto">Deixar o Assistente identificar</option><option value="controle_leiteiro">Controle leiteiro individual</option><option value="producao_diaria">Produção diária total</option></select></label>
        <label><span className="block text-xs font-medium text-ink-soft mb-1">Organização na Galeria</span><select disabled={busy} className={inputCls} value={categoryMode} onChange={(event) => setCategoryMode(event.target.value as CategoryMode)}><option value="automatic">Classificar automaticamente</option><option value="manual">Escolher uma categoria</option></select></label>
      </div>
      {categoryMode === "manual" && <label className="block mt-3"><span className="block text-xs font-medium text-ink-soft mb-1">Categoria para todos os arquivos</span><select disabled={busy} className={inputCls} value={manualCategory} onChange={(event) => setManualCategory(event.target.value as AssistantAttachmentCategory)}>{(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}</select></label>}
      {contextKind !== "auto" && <div className={`grid gap-3 mt-3 ${contextKind === "controle_leiteiro" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
        {contextKind === "controle_leiteiro" && <label><span className="block text-xs font-medium text-ink-soft mb-1">Lote</span><select disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture} className={inputCls} value={groupId} onChange={(event) => { const id = event.target.value; setGroupId(id); const group = state.groups.find((candidate) => candidate.id === id); setShift(group?.milkingsPerDay === 1 ? "unica" : "manha"); }}><option value="">Selecione o Lote</option>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
        <label><span className="block text-xs font-medium text-ink-soft mb-1">Data</span><input disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture} type="date" className={inputCls} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {contextKind === "controle_leiteiro" && <label><span className="block text-xs font-medium text-ink-soft mb-1">Turno</span><select disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture} className={inputCls} value={shift} onChange={(event) => setShift(event.target.value as typeof shift)}>{selectedGroup?.milkingsPerDay !== 1 && <><option value="manha">Manhã</option><option value="tarde">Tarde</option></>} {selectedGroup?.milkingsPerDay === 1 && <option value="unica">Única</option>}</select></label>}
      </div>}

      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <Button variant="secondary" onClick={() => cameraInput.current?.click()} disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture}><Camera size={16} /> Tirar foto</Button>
        <Button variant="secondary" onClick={() => galleryInput.current?.click()} disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture}><ImagePlus size={16} /> Escolher fotos</Button>
        <Button variant="secondary" onClick={() => setGalleryOpen(true)} disabled={busy || textBusy || Boolean(textCaptureId) || hasPreservedCapture}><Images size={16} /> Usar arquivos salvos</Button>
      </div>
      <p className="text-xs text-ink-faint mt-2">Selecione várias imagens JPEG, PNG ou WEBP, até 10 MB cada. Cada imagem gera sua própria Captura e Proposta revisável.</p>

      {items.length > 0 && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => <div key={item.key} className={`rounded-2xl border overflow-hidden ${item.stage === "error" ? "border-danger-200" : item.stage === "done" ? "border-pasture-200" : "border-ink/10"}`}>
          {item.attachment?.kind === "imagem" || item.file ? <button type="button" className="w-full" onClick={() => setViewer({ src: item.preview, alt: item.name })}><img src={item.preview} alt={item.name} className="w-full h-52 object-contain bg-paper-sunken" /><span className="sr-only">Ampliar {item.name}</span></button> : <div className="w-full h-40 grid place-items-center bg-paper-sunken"><AudioLines size={36} className="text-ink-faint" /></div>}
          <div className="p-3 flex gap-2 items-start">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{item.name}</p><p className={`text-xs mt-1 ${item.stage === "error" ? "text-danger-600" : item.stage === "done" ? "text-pasture-700" : "text-ink-faint"}`}>{item.stage === "done" && <Check size={13} className="inline mr-1" />}{stageLabel[item.stage]}</p>{item.error && <p className="text-xs text-danger-600 mt-1">{item.error}</p>}</div>
            <button type="button" onClick={() => removeItem(item.key)} disabled={busy} className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-ink-soft hover:bg-ink/5 disabled:opacity-50" aria-label={`Remover ${item.name}`}><Trash2 size={17} /></button>
          </div>
        </div>)}
      </div>}
      {batchError && <div className="mt-3"><InlineError>{batchError}</InlineError></div>}
      <div className="flex items-center gap-3 mt-4">
        {completedCount > 0 && <span className="text-xs text-pasture-700">{completedCount} {completedCount === 1 ? "Proposta criada" : "Propostas criadas"}</span>}
        {items.length === 0 ? <Button className="ml-auto" disabled={textBusy || busy || (!text.trim() && contextKind === "auto")} onClick={() => void submitTextOnly()}>{textBusy && <LoaderCircle size={15} className="animate-spin" />}{textBusy ? "Interpretando…" : textCaptureId ? "Tentar novamente" : "Gerar proposta"}</Button> : <Button className="ml-auto" disabled={pendingCount === 0 || busy || textBusy} onClick={() => void processBatch()}>{busy && <LoaderCircle size={15} className="animate-spin" />}{busy ? "Processando lote…" : pendingCount > 0 ? `Gerar ${pendingCount} ${pendingCount === 1 ? "proposta" : "propostas"}` : "Tudo processado"}</Button>}
      </div>
    </Card>
    <SavedAttachmentSheet open={galleryOpen} attachments={attachments} onClose={() => setGalleryOpen(false)} onSelect={(selected) => { addStored(selected); setGalleryOpen(false); }} />
    {viewer && <ImageViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
  </>;
}

function SavedAttachmentSheet({ open, attachments, onClose, onSelect }: { open: boolean; attachments: AssistantCaptureAttachment[]; onClose: () => void; onSelect: (attachments: AssistantCaptureAttachment[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (!open) setSelected([]); }, [open]);
  return <Sheet open={open} onClose={onClose} title="Usar arquivos salvos" footer={attachments.length > 0 ? <Button className="w-full" disabled={selected.length === 0} onClick={() => onSelect(attachments.filter((attachment) => selected.includes(attachment.id)))}>Adicionar {selected.length || ""} {selected.length === 1 ? "arquivo" : "arquivos"}</Button> : undefined}>
    {attachments.length === 0 ? <p className="text-sm text-ink-soft">Nenhum arquivo salvo na Galeria.</p> : <div className="space-y-2"><p className="text-sm text-ink-soft mb-3">Selecione um ou vários arquivos para criar Revisões separadas.</p>{attachments.map((attachment) => { const checked = selected.includes(attachment.id); return <button key={attachment.id} type="button" onClick={() => setSelected((current) => checked ? current.filter((id) => id !== attachment.id) : [...current, attachment.id])} className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left min-h-[68px] ${checked ? "border-pasture-400 bg-pasture-50" : "border-ink/5 hover:bg-ink/[0.03]"}`}>
      <div className="size-14 rounded-lg bg-paper-sunken grid place-items-center overflow-hidden shrink-0">{attachment.kind === "imagem" ? <img src={captureAttachmentUrl(attachment.captureId, attachment.id)} alt="" className="size-full object-cover" /> : attachment.kind === "audio" ? <AudioLines size={22} className="text-ink-faint" /> : <Images size={22} className="text-ink-faint" />}</div>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{attachment.name ?? "Arquivo salvo"}</span><span className="block text-xs text-ink-faint mt-0.5">{attachment.kind === "imagem" ? "Imagem" : attachment.kind === "audio" ? "Áudio" : "Documento"}</span></span>
      <span className={`size-6 rounded-md border grid place-items-center ${checked ? "bg-pasture-600 border-pasture-600 text-white" : "border-ink/20"}`}>{checked && <Check size={15} />}</span>
    </button>; })}</div>}
  </Sheet>;
}
