import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import type {
  AssistantAttachmentCategory,
  AssistantCapture,
  AssistantCaptureAttachment,
} from "../../domain/types";
import { captureAttachmentUrl, formatWhen } from "../assistente/helpers";
import { uploadAssistantFile } from "../../state/api";
import { useFarm } from "../../state/store";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  Sheet,
  inputCls,
} from "../../components/ui";

const CATEGORY_LABEL: Record<AssistantAttachmentCategory, string> = {
  controle_leiteiro: "Controle leiteiro",
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssistantAttachmentCategory | "todas">("todas");
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [uploadCategory, setUploadCategory] = useState<AssistantAttachmentCategory>("outro");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const items = useMemo<GalleryItem[]>(() => {
    const rows: GalleryItem[] = [];
    for (const capture of state.captures) {
      for (const attachment of capture.attachments ?? []) {
        if (attachment.deletedAt) continue;
        rows.push({ attachment, capture });
      }
    }
    return rows
      .filter(({ attachment, capture }) => {
        const text = `${attachmentName(attachment)} ${CATEGORY_LABEL[attachmentCategory(attachment)]} ${capture.text ?? ""} ${capture.extractedText ?? ""}`.toLocaleLowerCase("pt-BR");
        return (category === "todas" || attachmentCategory(attachment) === category) && text.includes(query.trim().toLocaleLowerCase("pt-BR"));
      })
      .sort((a, b) => b.capture.createdAt.localeCompare(a.capture.createdAt));
  }, [state.captures, category, query]);

  const allCount = state.captures.reduce((sum, capture) => sum + (capture.attachments?.filter((attachment) => !attachment.deletedAt).length ?? 0), 0);

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const capture = await uploadAssistantFile(file, uploadCategory);
      syncAssistantInterpretation({ capture, proposals: [] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível guardar o arquivo.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setUploading(false);
    }
  }

  async function remove(item: GalleryItem) {
    if (!window.confirm(`Remover “${attachmentName(item.attachment)}” da Galeria?`)) return;
    const result = await dispatch({ type: "DeleteAssistantAttachment", attachmentId: item.attachment.id });
    if (!result.ok) setUploadError(result.message);
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
              accept="image/jpeg,image/png,image/webp,application/pdf,audio/*"
              className="sr-only"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={16} /> {uploading ? "Enviando…" : "Adicionar arquivo"}
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
          <select className={`${inputCls} md:max-w-48`} value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as AssistantAttachmentCategory)} aria-label="Categoria do próximo arquivo">
            {(Object.keys(CATEGORY_LABEL) as AssistantAttachmentCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
          </select>
        </div>
        {uploadError && <div className="mt-3"><InlineError>{uploadError}</InlineError></div>}
        <p className="text-xs text-ink-faint mt-3">{allCount} {allCount === 1 ? "arquivo" : "arquivos"} guardados · imagens, PDFs e áudios até 25 MB</p>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState icon={<Images size={30} />} title={allCount === 0 ? "A Galeria está vazia" : "Nenhum arquivo encontrado"} hint={allCount === 0 ? "Adicione uma foto ou documento para reutilizar no Assistente." : "Tente outra busca ou categoria."} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const url = captureAttachmentUrl(item.capture.id, item.attachment.id);
            return (
              <Card key={item.attachment.id} className="overflow-hidden">
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
  return <Sheet open onClose={onClose} title={attachmentName(item.attachment)} footer={<a className="inline-flex items-center justify-center gap-2 rounded-xl bg-pasture-600 text-white px-4 py-2.5 text-sm font-semibold min-h-[44px] w-full" href={`${url}?download=1`}><Download size={16} /> Baixar arquivo</a>}>
    {isImage(item.attachment) ? <img src={url} alt={attachmentName(item.attachment)} className="w-full max-h-[60vh] object-contain rounded-xl bg-paper-sunken" /> : isAudio(item.attachment) ? <audio controls src={url} className="w-full" /> : <iframe title={attachmentName(item.attachment)} src={url} className="w-full h-[60vh] rounded-xl border border-black/10" />}
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
