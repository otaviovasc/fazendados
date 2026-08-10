# Áudio do jogo

O jogo procura os arquivos abaixo (caminhos fixos, definidos em
`app/src/modules/jogo/audio/audio.ts` → `GAME_AUDIO_FILES`).

| Arquivo | Quando toca |
|---|---|
| `soundtrack.mp3` | Trilha ambiente em loop no tabuleiro (volume 0.32) |
| `click.mp3` | Toque em instalações / abrir folhas |

Formato: `.mp3` (ou troque a extensão também em `GAME_AUDIO_FILES`). Efeitos
curtos (< 2s); a trilha pode ser longa — ela entra em loop.
