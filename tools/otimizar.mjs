// =====================================================================
//  OTIMIZADOR DA PÁGINA
//  Lê os arquivos editáveis em src/ e gera a versão publicada (rápida):
//    - index.html / index-b.html na raiz (HTML + CSS + JS minificados num só arquivo)
//    - assets/img/  imagens em WebP, com versões menores para telas pequenas
//    - assets/fonts/ fontes reduzidas só aos caracteres usados (português)
//
//  Como usar:  npm run otimizar
//  (rode sempre depois de editar algo em src/ ou trocar imagens em images/)
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import sharp from 'sharp';
import { minify } from 'html-minifier-terser';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const IMG_OUT = path.join(ROOT, 'assets', 'img');
const FONT_SRC = path.join(SRC, 'fonts');
const FONT_OUT = path.join(ROOT, 'assets', 'fonts');

// Larguras das versões menores (nunca maiores que a original; nada é esticado)
const WIDTHS = [360, 480, 640, 828, 1080, 1280, 1600];
const MAX_WIDTH = 1600;      // imagens maiores que isso são reduzidas (sem distorcer)
const WEBP_QUALITY = 80;     // qualidade das versões reduzidas

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;

// ---------- CSS e JS minificados ----------
const css = esbuild.transformSync(fs.readFileSync(path.join(SRC, 'style.css'), 'utf8'), {
  loader: 'css', minify: true, target: ['chrome90', 'safari14', 'firefox90', 'edge90'],
}).code.trim();
const js = esbuild.transformSync(fs.readFileSync(path.join(SRC, 'script.js'), 'utf8'), {
  loader: 'js', minify: true, target: 'es2017',
}).code.trim();
if (css.includes('</style')) throw new Error('CSS contém </style>');
if (js.includes('</script')) throw new Error('JS contém </script>');

// ---------- Fontes: só os caracteres do português + os que aparecem nas páginas ----------
// (arquivos ~25% menores; se você escrever um texto novo, rode de novo e ele entra automaticamente)
let fontChars = '';
for (let i = 0x20; i <= 0x7e; i++) fontChars += String.fromCharCode(i);
fontChars += 'ÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜàáâãäçèéêëìíîïñòóôõöùúûüªº°·–—‘’‚“”„•…€™×«»§¡¿ ';
for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  fontChars += text;
}
fontChars = [...new Set(fontChars)].filter((ch) => ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x2122).join('');
fs.rmSync(FONT_OUT, { recursive: true, force: true });
fs.mkdirSync(FONT_OUT, { recursive: true });
const fontReport = [];
for (const f of fs.readdirSync(FONT_SRC).filter((f) => f.endsWith('.woff2'))) {
  const full = fs.readFileSync(path.join(FONT_SRC, f));
  const sub = await subsetFont(full, fontChars, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(FONT_OUT, f), sub);
  fontReport.push(`${f.padEnd(28)} ${kb(full.length)} -> ${kb(sub.length)}`);
}

// ---------- Imagens ----------
fs.rmSync(IMG_OUT, { recursive: true, force: true });
fs.mkdirSync(IMG_OUT, { recursive: true });
const imageCache = new Map();
let imgBytes = 0;

function slugOf(rel) {
  return rel.replace(/^images\//, '').replace(/\.[a-z0-9]+$/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function processImage(rel) {
  if (imageCache.has(rel)) return imageCache.get(rel);
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) throw new Error('Imagem não encontrada: ' + rel);
  const buf = fs.readFileSync(file);
  const meta = await sharp(buf).metadata();
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  const slug = slugOf(rel);
  const isWebp = meta.format === 'webp';

  // Largura final: a original (ou MAX_WIDTH se for gigante). A altura acompanha a proporção.
  const fullW = Math.min(meta.width, MAX_WIDTH);
  const fullH = Math.round(meta.height * (fullW / meta.width));
  const variants = [];

  for (const w of WIDTHS.filter((w) => w < fullW * 0.85)) {
    const out = await sharp(buf).resize({ width: w, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true }).toBuffer();
    const name = `${slug}-${w}w.${hash}.webp`;
    fs.writeFileSync(path.join(IMG_OUT, name), out);
    variants.push({ w, url: `assets/img/${name}`, bytes: out.length });
  }

  // Versão completa: se já é WebP no tamanho certo, copia sem recomprimir (zero perda de qualidade)
  let full;
  if (isWebp && fullW === meta.width) full = buf;
  else full = await sharp(buf).resize({ width: fullW, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6, smartSubsample: true }).toBuffer();
  const fullName = `${slug}-${fullW}w.${hash}.webp`;
  fs.writeFileSync(path.join(IMG_OUT, fullName), full);
  variants.push({ w: fullW, url: `assets/img/${fullName}`, bytes: full.length });

  const info = {
    width: fullW, height: fullH,
    src: `assets/img/${fullName}`,
    srcset: variants.length > 1 ? variants.map((v) => `${v.url} ${v.w}w`).join(', ') : '',
    variants,
  };
  imgBytes += variants.reduce((s, v) => s + v.bytes, 0);
  imageCache.set(rel, info);
  return info;
}

// ---------- Atributos de <img> ----------
function parseAttrs(tag) {
  const attrs = [];
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const inner = tag.replace(/^<img\b/i, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(inner))) attrs.push([m[1], m[2] ?? m[3] ?? m[4] ?? null]);
  return attrs;
}
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const unesc = (v) => String(v).replace(/&quot;/g, '"').replace(/&amp;/g, '&');

async function rewriteImg(tag, ctx) {
  const attrs = parseAttrs(tag);
  const get = (k) => attrs.find(([n]) => n === k)?.[1];
  const src = get('src');
  if (!src || !/^images\//.test(decodeURI(src))) return tag; // só mexe nas imagens do site
  const info = await processImage(decodeURI(src));
  const sizes = get('data-sizes') || '100vw';
  const defer = attrs.some(([n]) => n === 'data-defer');
  const high = get('fetchpriority') === 'high';

  const out = [];
  for (const [n, v] of attrs) {
    if (['src', 'srcset', 'sizes', 'width', 'height', 'data-sizes', 'data-defer', 'decoding'].includes(n)) continue;
    out.push(v === null ? n : `${n}="${esc(unesc(v))}"`);
  }
  if (!attrs.some(([n]) => n === 'alt')) out.push('alt=""');
  out.push(`width="${info.width}"`, `height="${info.height}"`);
  if (!high) out.push('decoding="async"'); // a imagem principal decodifica no ritmo normal (mais rápido para o LCP)
  if (defer) {
    // carregada depois pelo script (páginas 2+ do livro)
    out.push(`data-src="${info.src}"`);
    if (info.srcset) out.push(`data-srcset="${info.srcset}"`, `sizes="${esc(sizes)}"`);
  } else {
    out.push(`src="${info.src}"`);
    if (info.srcset) out.push(`srcset="${info.srcset}"`, `sizes="${esc(sizes)}"`);
  }
  if (high) ctx.lcp = { info, sizes };
  return `<img ${out.join(' ')}>`;
}

async function replaceAsync(str, re, fn) {
  const parts = []; let last = 0; let m;
  re.lastIndex = 0;
  while ((m = re.exec(str))) { parts.push(str.slice(last, m.index), fn(m[0])); last = m.index + m[0].length; }
  parts.push(str.slice(last));
  return (await Promise.all(parts)).join('');
}

// ---------- Páginas ----------
const pages = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));
const report = [];
for (const name of pages) {
  let html = fs.readFileSync(path.join(SRC, name), 'utf8');
  const ctx = {};

  // Comentários são só instruções para quem edita (e saem na minificação): não processa nada dentro deles
  html = html.replace(/<!--(?!\[)[\s\S]*?-->/g, '');
  html = await replaceAsync(html, /<img\b[^>]*>/gi, (tag) => rewriteImg(tag, ctx));

  // CSS inteiro no <head> (é pequeno: ~6 KB comprimido) -> a página pinta sem esperar outro arquivo
  const cssTag = /<link rel="stylesheet" href="style\.css">/;
  if (!cssTag.test(html)) throw new Error(name + ': não achei <link rel="stylesheet" href="style.css">');
  let head = `<style>${css}</style>`;
  if (ctx.lcp) {
    const { info, sizes } = ctx.lcp;
    const pre = `<link rel="preload" as="image" href="${info.src}"` +
      (info.srcset ? ` imagesrcset="${info.srcset}" imagesizes="${esc(sizes)}"` : '') + ' fetchpriority="high">';
    head = pre + head;
  }
  html = html.replace(cssTag, () => head);

  // JS no fim do <body>: roda depois que o conteúdo já está na tela
  const jsTag = /<script src="script\.js" defer><\/script>\s*/;
  if (!jsTag.test(html)) throw new Error(name + ': não achei <script src="script.js" defer>');
  html = html.replace(jsTag, () => '');
  if (!html.includes('</body>')) throw new Error(name + ': sem </body>');
  html = html.replace('</body>', () => `<script>${js}</script>\n</body>`);

  const min = await minify(html, {
    collapseWhitespace: true, conservativeCollapse: true, removeComments: true,
    removeRedundantAttributes: true, removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true, useShortDoctype: true, collapseBooleanAttributes: true,
    minifyJS: true, minifyCSS: false, decodeEntities: false,
  });
  const stamp = `<!-- ARQUIVO GERADO AUTOMATICAMENTE: edite src/${name} e rode "npm run otimizar" -->`;
  fs.writeFileSync(path.join(ROOT, name), min.replace(/^<!doctype html>/i, (d) => d + stamp));
  report.push(`${name.padEnd(14)} ${kb(min.length).padStart(9)}  (comprimido: ${kb(gz(min))})`);
}

console.log('\nPáginas geradas na raiz:');
report.forEach((r) => console.log('  ' + r));
console.log(`\nFontes (${fontChars.length} caracteres):`);
fontReport.forEach((r) => console.log('  ' + r));
console.log(`\nImagens: ${imageCache.size} originais -> ${fs.readdirSync(IMG_OUT).length} arquivos em assets/img (${kb(imgBytes)} no total)`);
for (const [rel, i] of imageCache) {
  console.log(`  ${rel.padEnd(52)} ${String(i.width + 'x' + i.height).padEnd(9)} ` + i.variants.map((v) => `${v.w}w ${kb(v.bytes)}`).join(' | '));
}
console.log('\nPronto. Publique: index.html, index-b.html e a pasta assets/.\n');
