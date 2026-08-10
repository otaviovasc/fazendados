/**
 * Áudio do jogo: trilha ambiente + efeitos curtos. Os arquivos vivem em
 * `app/public/audio/game/` (lista em GAME_AUDIO_FILES; veja o README da pasta).
 *
 * Regras:
 * - Nada toca antes do primeiro gesto do usuário (política de autoplay);
 *   `init()` arma o unlock e a trilha começa sozinha no primeiro toque.
 * - Mudo é persistido em localStorage ('game-audio-muted') e vale para tudo.
 * - A trilha pausa quando a aba perde visibilidade.
 */

export type GameSoundKey = 'click';

/** Caminhos públicos dos arquivos de áudio — substitua pelos definitivos mantendo os nomes. */
export const GAME_AUDIO_FILES: Record<GameSoundKey | 'soundtrack', string> = {
  soundtrack: '/audio/game/soundtrack.mp3',
  click: '/audio/game/click.mp3',
};

const MUTED_KEY = 'game-audio-muted';
const SFX_VOLUME = 0.5;
const SOUNDTRACK_VOLUME = 0.32;

type Listener = () => void;

let muted = readMuted();
let unlocked = false;
let initCount = 0;
const listeners = new Set<Listener>();
/** Elementos por som; null = arquivo ausente confirmado (o som não toca). */
const elements = new Map<string, HTMLAudioElement | null>();
let soundtrackElement: HTMLAudioElement | null = null;

function isSuppressed() {
  return muted;
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; }
}

function notify() { listeners.forEach((listener) => listener()); }

/** Carrega (uma vez) o elemento de um som; resolve null se o arquivo faltar. */
function loadElement(key: GameSoundKey | 'soundtrack'): Promise<HTMLAudioElement | null> {
  const cached = elements.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const element = new Audio(GAME_AUDIO_FILES[key]);
    element.preload = 'auto';
    const settle = (found: HTMLAudioElement | null) => {
      elements.set(key, found);
      resolve(found);
    };
    element.addEventListener('canplaythrough', () => settle(element), { once: true });
    element.addEventListener('error', () => settle(null), { once: true });
    element.load();
  });
}

// --- Trilha ---

async function startSoundtrack() {
  if (isSuppressed() || !unlocked) return;
  const element = await loadElement('soundtrack');
  if (isSuppressed() || !unlocked || !element) return;
  soundtrackElement = element;
  element.loop = true;
  element.volume = SOUNDTRACK_VOLUME;
  void element.play().catch(() => { /* autoplay negado: tenta no próximo gesto */ });
}

function stopSoundtrack() {
  soundtrackElement?.pause();
}

function handleVisibility() {
  if (document.hidden) stopSoundtrack();
  else if (initCount > 0) void startSoundtrack();
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  void startSoundtrack();
}

export const gameAudio = {
  /** Monta os listeners (gesto de unlock + visibilidade). Par com dispose(). */
  init() {
    initCount += 1;
    if (initCount > 1) return;
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', handleVisibility);
  },
  dispose() {
    initCount = Math.max(0, initCount - 1);
    if (initCount > 0) return;
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
    document.removeEventListener('visibilitychange', handleVisibility);
    stopSoundtrack();
    unlocked = false;
  },
  isMuted() { return muted; },
  toggleMuted() {
    muted = !muted;
    try { localStorage.setItem(MUTED_KEY, muted ? '1' : '0'); } catch { /* modo privado */ }
    if (muted) stopSoundtrack();
    else void startSoundtrack();
    notify();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Toca um efeito; se o arquivo não existir, o som simplesmente não toca. */
  play(key: GameSoundKey) {
    if (isSuppressed() || !unlocked) return;
    void loadElement(key).then((element) => {
      if (isSuppressed() || !element) return;
      const instance = element.cloneNode(true) as HTMLAudioElement;
      instance.volume = SFX_VOLUME;
      void instance.play().catch(() => { /* reprodução negada: ignora */ });
    });
  },
};
