import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

/** Full-size original for checking handwriting without leaving a draft. */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const buttons = closeRef.current?.parentElement?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[1300] bg-black/95 text-white flex flex-col">
      <div className="flex items-center gap-2 p-3 shrink-0 border-b border-white/20">
        <p className="flex-1 min-w-0 truncate text-sm">{alt}</p>
        <button type="button" aria-label="Diminuir imagem" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} className="min-h-11 min-w-11 grid place-items-center rounded-xl hover:bg-white/10"><Minus size={20} /></button>
        <span className="text-xs w-10 text-center">{zoom * 100}%</span>
        <button type="button" aria-label="Ampliar imagem" onClick={() => setZoom((value) => Math.min(4, value + 0.5))} className="min-h-11 min-w-11 grid place-items-center rounded-xl hover:bg-white/10"><Plus size={20} /></button>
        <button ref={closeRef} type="button" aria-label="Fechar imagem" onClick={onClose} className="min-h-11 min-w-11 grid place-items-center rounded-xl hover:bg-white/10"><X size={22} /></button>
      </div>
      <div className="flex-1 overflow-auto touch-pan-x touch-pan-y">
        <div className="grid place-items-center min-h-full" style={{ width: `${zoom * 100}%` }}>
          <img src={src} alt={alt} className="w-full object-contain" style={{ height: `calc((100dvh - 78px) * ${zoom})` }} />
        </div>
      </div>
      <p className="text-center text-xs text-white/70 p-2">Use + para ampliar e deslize para conferir os detalhes.</p>
    </div>
  );
}
