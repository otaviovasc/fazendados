import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  AudioLines,
  Eye,
  FileText,
  Images,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  AssistantAttachmentCategory,
  AssistantCapture,
  AssistantCaptureAttachment,
} from "../../domain/types";
import { captureAttachmentUrl, formatWhen } from "../assistente/helpers";
import { uploadAssistantFile } from "../../state/api";
import { useFarm } from "../../state/store";
import { ImageViewer } from "../../components/ImageViewer";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  Sheet,
  SuccessNotice,
  inputCls,
} from "../../components/ui";

const CATEGORY_LABEL: Record<AssistantAttachmentCategory, string> = {
  producao_diaria: "Produção diária",
  controle_leiteiro: "Controle leiteiro",
  coleta: "Coleta",
  comprovante: "Comprovante",
  nota_fiscal: "Nota fiscal",
  financeiro: "Financeiro",
  mapa: "Mapa",
  outro: "Outro",
};

type GalleryItem = {
  attachment: AssistantCaptureAttachment;
  capture: AssistantCapture;
};

const attachmentName = (attachment: AssistantCaptureAttachment) => attachment.name ?? "Arquivo sem nome";
const attachmentCategory = (attachment: AssistantCaptureAttachment): AssistantAttachmentCategory => attachment.category ?? "outro";

function isImage(attachment: AssistantCaptureAttachment) {
  return attachment.kind === "imagem";
}

function isAudio(attachment: AssistantCaptureAttachment) {
  return attachment.kind === "audio";
}

function bytesLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export default function GaleriaPage() {
  const { state, dispatch, syncAssistantInterpretation } = useFarm();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssistantAttachmentCategory | "todas">("todas");
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [uploadCategory, setUploadCategory] = useState<AssistantAttachmentCategory>("outro");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [sort, setSort] = useState<"recentes" | "antigos" | "nome">("recentes");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<AssistantAttachmentCategory>("outro");
  const [bulkBusy, setBulkBusy] = useState(false);

  const allItems = useMemo<GalleryItem[]>(() => {
    const rows: GalleryItem[] = [];
    for (const capture of state.captures) {
      for (const attachment of capture.attachments ?? []) {
        if (attachment.deletedAt) continue;
        rows.push({ attachment, capture });
      }
    }
    return rows;
  }, [state.captures]);

  const items = useMemo<GalleryItem[]>(() => {
    return allItems
      .filter(({ attachment, capture }) => {
        const text = `${attachmentName(attachment)} ${CATEGORY_LABEL[attachmentCategory(attachment)]} ${capture.text ?? ""} ${capture.extractedText ?? ""}`.toLocaleLowerCase("pt-BR");
        return (category === "todas" || attachmentCategory(attachment) === category) && text.includes(query.trim().toLocaleLowerCase("pt-BR"));
      })
      .sort((a, b) => {
        if (sort === "nome") return attachmentName(a.attachment).localeCompare(attachmentName(b.attachment), "pt-BR");
        const chronological = b.capture.createdAt.localeCompare(a.capture.createdAt);
        return sort === "recentes" ? chronological : -chronological;
      });
  }, [allItems, category, query, sort]);

  const allCount = allItems.length;
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries((Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => [key, 0])) as Record<AssistantAttachmentCategory, number>;
    for (const { attachment } of allItems) counts[attachmentCategory(attachment)] += 1;
    return counts;
  }, [allItems]);
  const selectedItems = allItems.filter(({ attachment }) => selectedIds.has(attachment.id));
  const allVisibleSelected = items.length > 0 && items.every(({ attachment }) => selectedIds.has(attachment.id));

  async function upload(files: FileList | File[] | null) {
    if (!files?.length || uploading) return;
    setUploading(true);
    setUploadError(null);
    setSuccessMessage(null);
    setFailedFiles([]);
    const pending = Array.from(files);
    setUploadProgress({ done: 0, total: pending.length });
    const failures: string[] = [];
    const failedPending: File[] = [];
    for (let index = 0; index < pending.length; index += 1) {
      const file = pending[index];
      try {
        const capture = await uploadAssistantFile(file, uploadCategory);
        syncAssistantInterpretation({ capture, proposals: [] });
      } catch (error) {
        failedPending.push(file);
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "não foi possível guardar"}`);
      }
      setUploadProgress({ done: index + 1, total: pending.length });
    }
    if (failures.length) {
      setFailedFiles(failedPending);
      setUploadError(`${failures.length} arquivo(s) não foram enviados. ${failures.join(" · ")}`);
    }
    const uploadedCount = pending.length - failures.length;
    if (uploadedCount > 0) setSuccessMessage(`${uploadedCount} ${uploadedCount === 1 ? "arquivo adicionado" : "arquivos adicionados"} à Galeria.`);
    if (fileInput.current) fileInput.current.value = "";
    setUploading(false);
    setUploadProgress(null);
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) items.forEach(({ attachment }) => next.delete(attachment.id));
      else items.forEach(({ attachment }) => next.add(attachment.id));
      return next;
    });
  }

  async function classifySelected() {
    if (!selectedItems.length || bulkBusy) return;
    setBulkBusy(true); setUploadError(null);
    const failures: string[] = [];
    for (const item of selectedItems) {
      const result = await dispatch({ type: "UpdateAssistantAttachment", attachmentId: item.attachment.id, name: attachmentName(item.attachment), category: bulkCategory });
      if (!result.ok) failures.push(attachmentName(item.attachment));
    }
    setBulkBusy(false);
    if (failures.length) setUploadError(`Não foi possível classificar: ${failures.join(", ")}.`);
    else { setSelectedIds(new Set()); setSuccessMessage(`${selectedItems.length} ${selectedItems.length === 1 ? "arquivo classificado" : "arquivos classificados"}.`); }
  }

  async function remove(item: GalleryItem) {
    if (!window.confirm(`Remover “${attachmentName(item.attachment)}” da Galeria?`)) return;
    const result = await dispatch({ type: "DeleteAssistantAttachment", attachmentId: item.attachment.id });
    if (!result.ok) setUploadError(result.message);
    else setSelectedIds((current) => { const next = new Set(current); next.delete(item.attachment.id); return next; });
  }

  return (
    <div>
      <PageHeader
        title="Galeria"
        subtitle="Fotos e documentos da Fazenda, organizados e reutilizáveis."
        action={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf,audio/*"
              className="sr-only"
              onChange={(event) => void upload(event.target.files)}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={16} /> {uploading ? `Enviando ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}` : "Adicionar arquivos"}
            </Button>
          </>
        }
      />

      <Card className="p-3 md:p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-2">
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input className={`${inputCls} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar arquivo ou observação" aria-label="Buscar na Galeria" />
          </label>
          <select className={`${inputCls} md:max-w-56`} value={category} onChange={(event) => setCategory(event.target.value as AssistantAttachmentCategory | "todas")} aria-label="Filtrar por categoria">
            <option value="todas">Todas as categorias</option>
            {(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
          </select>
          <select className={`${inputCls} md:max-w-44`} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Ordenar arquivos">
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="nome">Nome A–Z</option>
          </select>
          <label className="md:max-w-52 flex-1">
            <span className="block text-xs text-ink-faint mb-1">Categoria ao adicionar</span>
            <select className={inputCls} value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as AssistantAttachmentCategory)}>
              {(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1" aria-label="Categorias da Galeria">
          <button type="button" onClick={() => setCategory("todas")} className={`shrink-0 min-h-[44px] rounded-xl px-3 text-sm font-medium ${category === "todas" ? "bg-pasture-600 text-white" : "bg-paper-sunken text-ink-soft"}`}>Todos <span className="opacity-75">{allCount}</span></button>
          {(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <button key={key} type="button" onClick={() => setCategory(key)} className={`shrink-0 min-h-[44px] rounded-xl px-3 text-sm font-medium ${category === key ? "bg-pasture-600 text-white" : "bg-paper-sunken text-ink-soft"}`}>{CATEGORY_LABEL[key]} <span className="opacity-75">{categoryCounts[key]}</span></button>)}
          {items.length > 0 && <button type="button" onClick={toggleVisibleSelection} className="shrink-0 min-h-[44px] rounded-xl px-3 text-sm font-semibold text-pasture-700 border border-pasture-200">{allVisibleSelected ? "Desmarcar exibidos" : `Selecionar exibidos (${items.length})`}</button>}
        </div>
        {uploadError && <div className="mt-3"><InlineError><span>{uploadError}</span>{failedFiles.length > 0 && <button type="button" className="block underline font-semibold mt-2 min-h-[44px]" disabled={uploading} onClick={() => void upload(failedFiles)}>Tentar arquivos com falha novamente</button>}</InlineError></div>}
        {successMessage && <div className="mt-3"><SuccessNotice message={successMessage} onDismiss={() => setSuccessMessage(null)} /></div>}
        <p className="text-xs text-ink-faint mt-3">{allCount} {allCount === 1 ? "arquivo" : "arquivos"} guardados · imagens, PDFs e áudios até 25 MB</p>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="p-3 mb-4 sticky top-2 z-20 shadow-lg border-pasture-200">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <p className="text-sm font-semibold flex-1">{selectedIds.size} {selectedIds.size === 1 ? "arquivo selecionado" : "arquivos selecionados"}</p>
            <select className={`${inputCls} md:max-w-52`} value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value as AssistantAttachmentCategory)} aria-label="Nova categoria dos selecionados">
              {(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
            </select>
            <Button variant="secondary" disabled={bulkBusy} onClick={() => void classifySelected()}>{bulkBusy ? "Classificando…" : "Classificar lote"}</Button>
            <Button onClick={() => navigate("/assistente", { state: { attachmentIds: Array.from(selectedIds) } })}>Usar no Assistente</Button>
            <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><EmptyState icon={<Images size={30} />} title={allCount === 0 ? "A Galeria está vazia" : "Nenhum arquivo encontrado"} hint={allCount === 0 ? "Adicione uma foto ou documento para reutilizar no Assistente." : "Tente outra busca ou categoria."} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const url = captureAttachmentUrl(item.capture.id, item.attachment.id);
            return (
              <Card key={item.attachment.id} className="overflow-hidden relative">
                <div className="absolute z-10 p-2">
                  <button type="button" onClick={() => toggleSelection(item.attachment.id)} className={`size-11 grid place-items-center rounded-xl border-2 shadow-sm ${selectedIds.has(item.attachment.id) ? "bg-pasture-600 text-white border-pasture-600" : "bg-white/95 text-ink-soft border-white"}`} aria-label={selectedIds.has(item.attachment.id) ? `Desmarcar ${attachmentName(item.attachment)}` : `Selecionar ${attachmentName(item.attachment)}`} aria-pressed={selectedIds.has(item.attachment.id)}>
                    {selectedIds.has(item.attachment.id) ? <Check size={20} /> : <span className="size-4 rounded border-2 border-current" />}
                  </button>
                </div>
                <button type="button" className="w-full text-left" onClick={() => setSelected(item)} aria-label={`Visualizar ${attachmentName(item.attachment)}`}>
                  <div className="h-36 bg-paper-sunken grid place-items-center overflow-hidden">
                    {isImage(item.attachment) ? <img src={url} alt={attachmentName(item.attachment)} className="w-full h-full object-cover" loading="lazy" /> : isAudio(item.attachment) ? <AudioLines size={42} className="text-ink-faint" /> : <FileText size={42} className="text-ink-faint" />}
                  </div>
                </button>
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <p className="font-medium text-sm truncate flex-1" title={attachmentName(item.attachment)}>{attachmentName(item.attachment)}</p>
                    <Chip tone="neutro">{CATEGORY_LABEL[attachmentCategory(item.attachment)]}</Chip>
                  </div>
                  <p className="text-xs text-ink-faint mt-1">{bytesLabel(item.attachment.byteSize)} · {formatWhen(item.capture.createdAt)}</p>
                  <div className="flex gap-1 mt-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setSelected(item)}><Eye size={15} /> Abrir</Button>
                    <a className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-ink-soft hover:bg-ink/5" href={`${url}?download=1`} aria-label={`Baixar ${attachmentName(item.attachment)}`}><Download size={16} /></a>
                    <button className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-ink-soft hover:bg-ink/5" onClick={() => setEditing(item)} aria-label={`Editar ${attachmentName(item.attachment)}`}><Pencil size={16} /></button>
                    <button className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-danger-600 hover:bg-danger-100" onClick={() => void remove(item)} aria-label={`Remover ${attachmentName(item.attachment)}`}><Trash2 size={16} /></button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PreviewSheet item={selected} onClose={() => setSelected(null)} />
      <EditSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PreviewSheet({ item, onClose }: { item: GalleryItem | null; onClose: () => void }) {
  if (!item) return null;
  const url = captureAttachmentUrl(item.capture.id, item.attachment.id);
  if (isImage(item.attachment)) return <ImageViewer src={url} alt={attachmentName(item.attachment)} onClose={onClose} />;
  return <Sheet open onClose={onClose} title={attachmentName(item.attachment)} footer={<a className="inline-flex items-center justify-center gap-2 rounded-xl bg-pasture-600 text-white px-4 py-2.5 text-sm font-semibold min-h-[44px] w-full" href={`${url}?download=1`}><Download size={16} /> Baixar arquivo</a>}>
    {isAudio(item.attachment) ? <audio controls src={url} className="w-full" /> : <iframe title={attachmentName(item.attachment)} src={url} className="w-full h-[60vh] rounded-xl border border-ink/10" />}
    <p className="text-xs text-ink-faint mt-3">{CATEGORY_LABEL[attachmentCategory(item.attachment)]} · {formatWhen(item.capture.createdAt)}</p>
  </Sheet>;
}

function EditSheet({ item, onClose }: { item: GalleryItem | null; onClose: () => void }) {
  const { dispatch } = useFarm();
  const [name, setName] = useState(item ? attachmentName(item.attachment) : "");
  const [category, setCategory] = useState<AssistantAttachmentCategory>(item ? attachmentCategory(item.attachment) : "outro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(attachmentName(item.attachment));
    setCategory(attachmentCategory(item.attachment));
    setError(null);
  }, [item?.attachment.id]);
  if (!item) return null;
  const currentItem = item;
  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    const result = await dispatch({ type: "UpdateAssistantAttachment", attachmentId: currentItem.attachment.id, name: name.trim(), category });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    onClose();
  }
  return <Sheet open onClose={onClose} title="Editar arquivo" footer={<Button className="w-full" disabled={!name.trim() || busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar alterações"}</Button>}>
    <div className="space-y-4">
      {error && <InlineError>{error}</InlineError>}
      <Field label="Nome"><input className={inputCls} value={name} onChange={(event) => setName(event.target.value)} maxLength={180} /></Field>
      <Field label="Categoria"><select className={inputCls} value={category} onChange={(event) => setCategory(event.target.value as AssistantAttachmentCategory)}>{(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}</select></Field>
    </div>
  </Sheet>;
}
