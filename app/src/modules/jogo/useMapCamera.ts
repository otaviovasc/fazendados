import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { CAMERA_MAX_SCALE, CAMERA_MIN_SCALE, clampCamera, type CameraState } from '../../domain/game/camera';

const MIN_SCALE = CAMERA_MIN_SCALE;
const MAX_SCALE = CAMERA_MAX_SCALE;

type Camera = CameraState;

/**
 * Pan/zoom hand-rolled do mapa: transform aplicado num único <g>
 * (data-testid="game-camera"), sem re-render por frame de nada além do
 * transform. Arrasto/pinça/roda + botões acessíveis (+/−/centralizar). O
 * enquadramento é a moldura do jogo: nunca afasta além da fazenda inteira e o
 * pan trava suavemente nos limites do terreno (clamp puro em domain/game/camera).
 */
export function useMapCamera(viewWidth: number, viewHeight: number) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const dragDistance = useRef(0);
  const downTarget = useRef<EventTarget | null>(null);

  const clamp = useCallback((next: Camera): Camera => clampCamera(next, viewWidth, viewHeight), [viewWidth, viewHeight]);

  /** Converte px de tela em unidades do viewBox (o SVG preserva o aspecto). */
  const viewBoxFactor = useCallback((element: Element) => {
    const rect = element.getBoundingClientRect();
    // preserveAspectRatio="meet" usa uma escala uniforme: a mesma nos dois eixos.
    return Math.max(viewWidth / Math.max(rect.width, 1), viewHeight / Math.max(rect.height, 1));
  }, [viewWidth, viewHeight]);

  const zoomAt = useCallback((factor: number, focusX: number, focusY: number) => {
    setCamera((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const worldX = (focusX - current.x) / current.scale;
      const worldY = (focusY - current.y) / current.scale;
      return clamp({ scale, x: focusX - worldX * scale, y: focusY - worldY * scale });
    });
  }, [clamp]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    downTarget.current = event.target;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragDistance.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const factor = viewBoxFactor(event.currentTarget);
    dragDistance.current += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      const deltaX = (event.clientX - previous.x) * factor;
      const deltaY = (event.clientY - previous.y) * factor;
      setCamera((current) => clamp({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
      return;
    }
    if (pointers.current.size === 2 && pinchDistance.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = event.currentTarget.getBoundingClientRect();
      const midX = ((a.x + b.x) / 2 - rect.left) * factor;
      const midY = ((a.y + b.y) / 2 - rect.top) * factor;
      zoomAt(distance / pinchDistance.current, midX, midY);
      pinchDistance.current = distance;
    }
  }, [clamp, viewBoxFactor, zoomAt]);

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
    // Tap: o pointer capture retargeta o click nativo para o <svg> raiz, então
    // o onClick dos filhos nunca dispara. Re-despachamos o clique no elemento
    // clicável de origem — só vale se o gesto não foi arrasto/pinça.
    const target = downTarget.current;
    downTarget.current = null;
    if (pointers.current.size === 0 && dragDistance.current <= 6 && target instanceof Element) {
      target.closest('[role="button"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }, []);

  const onWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    // Impede a página de rolar junto com o zoom do mapa.
    event.preventDefault();
    const factor = viewBoxFactor(event.currentTarget);
    const rect = event.currentTarget.getBoundingClientRect();
    const focusX = (event.clientX - rect.left) * factor;
    const focusY = (event.clientY - rect.top) * factor;
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, focusX, focusY);
  }, [viewBoxFactor, zoomAt]);

  // Com xMidYMid meet, o centro do viewBox coincide com o centro visível da
  // viewport (o conteúdo é sempre centralizado), então o foco dos botões é o
  // centro visível por construção.
  const zoomIn = useCallback(() => zoomAt(1.25, viewWidth / 2, viewHeight / 2), [zoomAt, viewWidth, viewHeight]);
  const zoomOut = useCallback(() => zoomAt(1 / 1.25, viewWidth / 2, viewHeight / 2), [zoomAt, viewWidth, viewHeight]);
  const reset = useCallback(() => setCamera({ x: 0, y: 0, scale: 1 }), []);

  /** O último gesto foi arrasto (pan/pinça), não um tap? Consumido pelas
   * camadas clicáveis para não abrir a folha ao final de um arrasto. */
  const didDrag = useCallback(() => dragDistance.current > 6, []);

  const transform = useMemo(
    () => `translate(${camera.x.toFixed(2)} ${camera.y.toFixed(2)}) scale(${camera.scale.toFixed(3)})`,
    [camera],
  );

  return {
    transform,
    zoomIn,
    zoomOut,
    reset,
    didDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel },
  };
}
