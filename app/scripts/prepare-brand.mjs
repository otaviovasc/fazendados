// Gera os assets de marca otimizados a partir das artes originais em brand/.
// Os originais (~1,5 MB cada) ficam fora de public/ e NÃO vão para o deploy;
// só as versões reduzidas geradas aqui são servidas.
//
// Uso: pnpm brand
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC_ICON = "brand/logo-fazendados.png";
const SRC_COMPLETE = "brand/logo-complete-fazendados.png";
const OUT_ICONS = "public/icons";
const OUT_BRAND = "public/brand";

// Verde escuro do interior do ícone — fundo dos assets opacos (apple-touch, maskable).
const ICON_BG = "#0B3B1E";

async function trimmed(input) {
  // Corta as bordas transparentes da arte antes de redimensionar.
  return sharp(input).trim();
}

async function main() {
  await mkdir(OUT_ICONS, { recursive: true });
  await mkdir(OUT_BRAND, { recursive: true });

  // --- Ícone do app (arte quadrada, fundo transparente) ---
  const icon = await trimmed(SRC_ICON);

  await icon.clone().resize(192, 192).png({ compressionLevel: 9 }).toFile(`${OUT_ICONS}/icon-192.png`);
  await icon.clone().resize(512, 512).png({ compressionLevel: 9 }).toFile(`${OUT_ICONS}/icon-512.png`);

  // Maskable: arte cobre o canvas todo (full-bleed), com fundo opaco — nada
  // essencial fica perto das bordas, então máscaras circulares não cortam a vaca.
  await icon
    .clone()
    .resize(512, 512)
    .flatten({ background: ICON_BG })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT_ICONS}/icon-maskable-512.png`);

  // apple-touch-icon precisa ser opaco (o iOS não aplica alpha).
  await icon
    .clone()
    .resize(180, 180)
    .flatten({ background: ICON_BG })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT_ICONS}/apple-touch-icon.png`);

  await icon.clone().resize(48, 48).png({ compressionLevel: 9 }).toFile(`${OUT_ICONS}/favicon-48.png`);

  // --- Logo completa (horizontal) para uso nas telas ---
  // 640px de largura cobre exibição até ~320px em telas retina.
  const complete = await trimmed(SRC_COMPLETE);
  await complete
    .resize(640, null, { withoutEnlargement: true })
    .webp({ quality: 90 })
    .toFile(`${OUT_BRAND}/logo-complete.webp`);

  // Símbolo quadrado para espaços compactos (ex.: cabeçalho mobile).
  await icon.clone().resize(256, 256).webp({ quality: 90 }).toFile(`${OUT_BRAND}/logo-icon.webp`);

  console.log("[brand] assets gerados em public/icons e public/brand");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
