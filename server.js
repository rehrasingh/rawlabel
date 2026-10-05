import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import { setDefaultResultOrder } from 'node:dns';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import OpenAI from 'openai';

setDefaultResultOrder('ipv4first');

const root = fileURLToPath(new URL('.', import.meta.url));

function loadLocalEnv() {
  try {
    const contents = readFileSync(join(root, '.env'), 'utf8');
    contents.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch { /* .env is optional; environment variables may be supplied by the shell */ }
}

loadLocalEnv();
const siliconFlowKey = process.env.SILICONFLOW_API_KEY;
const siliconFlowClient = siliconFlowKey && !/^sk-your-key-here$/i.test(siliconFlowKey) ? new OpenAI({ apiKey: siliconFlowKey, baseURL: 'https://api.siliconflow.cn/v1' }) : null;
if (!siliconFlowClient) console.warn('SILICONFLOW_API_KEY is not set; DeepSeek-OCR fallback is disabled.');
const port = Number(process.env.PORT || 4173);
const maxBody = 50 * 1024 * 1024;
const maxPage = 3 * 1024 * 1024;
const timeoutMs = 12000;
const maxImageBytes = 8 * 1024 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};

const readRequest = async (req) => {
  const length = Number(req.headers['content-length'] || 0);
  if (length > maxBody) throw new Error('Request is too large.');
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBody) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const stripHtml = (value) => value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
const clean = (value) => stripHtml(String(value || '')).replace(/[\t\r\n]+/g, ' ').trim();
const unique = (items) => [...new Set(items.map((item) => clean(item)).filter(Boolean))];

function ipv4Private(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 0;
}

function ipv6Private(ip) {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
}

async function assertPublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid product URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http:// and https:// URLs are supported.');
  if (url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('That hostname is not allowed.');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => ipv4Private(address) || ipv6Private(address))) throw new Error('That URL resolves to a private or local network.');
  return url;
}

async function fetchPublicPage(input) {
  let current = await assertPublicUrl(input);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try { response = await fetch(current, { signal: controller.signal, redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 RawLabel/0.1 product analysis', accept: 'text/html,application/xhtml+xml' } }); }
    catch (error) { throw new Error(`Could not connect to the product page. ${error.cause?.code || error.message}`); }
    finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3) throw new Error('The page redirected too many times.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The product page returned an invalid redirect.');
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The product page returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) throw new Error('That URL does not return an HTML product page.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The product page returned no readable content.');
    const chunks = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxPage) { await reader.cancel(); throw new Error('The product page is larger than 3 MB.'); }
      chunks.push(Buffer.from(value));
    }
    return { url: current.toString(), html: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Unable to retrieve that product page.');
}

function jsonLd(html) {
  const objects = [];
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  scripts.forEach((script) => {
    const raw = script.replace(/<\/script>.*$/i, '').replace(/^[\s\S]*?>/, '').trim();
    try { const parsed = JSON.parse(raw); objects.push(...(Array.isArray(parsed) ? parsed : [parsed])); } catch { /* malformed JSON-LD is ignored */ }
  });
  return objects.flatMap((object) => object?.['@graph'] || object).filter(Boolean);
}

function firstMeta(html, names) {
  for (const name of names) {
    const pattern = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
    const reverse = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["'][^>]*>`, 'i');
    const match = html.match(pattern) || html.match(reverse);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function numberFrom(text, patterns) {
  for (const pattern of patterns) { const match = text.match(pattern); if (match?.[1]) return match[1].trim(); }
  return null;
}

function validNutritionValue(value, unit) {
  const raw = clean(value);
  const match = raw.match(/([0-9][0-9.,]*)\s*(kcal|mg|g)?/i);
  if (!match || !/[0-9]/.test(match[1])) return null;
  return `${match[1]} ${match[2] || unit}`;
}

const visionPrompt = `Extract nutrition information from this food packaging image.
Return ONLY valid JSON matching this schema:
{
  "serving_size": string | null,
  "basis": "per_serve" | "per_100g" | "unknown",
  "nutrition": {
    "energy_kcal": number | null,
    "protein_g": number | null,
    "carbohydrates_g": number | null,
    "total_sugar_g": number | null,
    "fat_g": number | null,
    "saturated_fat_g": number | null,
    "dietary_fiber_g": number | null,
    "sodium_mg": number | null
  },
  "ingredients": string[],
  "confidence": "high" | "medium" | "low",
  "notes": string
}
If a value is not visible, use null. Do not guess.`;

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function countNutritionFields(nutrition = {}) {
  return Object.values(nutrition).filter((value) => finiteNumber(value) !== null).length;
}

function validateNutrition(nutrition = {}, basis = 'unknown') {
  const ranges = {
    energy_kcal: [0, 900], protein_g: [0, 100], carbohydrates_g: [0, 100], total_sugar_g: [0, 100],
    fat_g: [0, 100], saturated_fat_g: [0, 100], dietary_fiber_g: [0, 100], sodium_mg: [0, 5000]
  };
  const rejectionReasons = [];
  const result = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = finiteNumber(nutrition[key]);
    if (value === null) { result[key] = null; continue; }
    if (value < min || value > max) {
      rejectionReasons.push(`${key} (${value}) is outside the plausible ${basis} range ${min}-${max}`);
      result[key] = null;
    } else result[key] = value;
  }
  if (result.total_sugar_g !== null && result.carbohydrates_g !== null && result.total_sugar_g > result.carbohydrates_g) {
    rejectionReasons.push(`sugar (${result.total_sugar_g}g) > carbs (${result.carbohydrates_g}g)`);
    result.total_sugar_g = null;
  }
  if (result.saturated_fat_g !== null && result.fat_g !== null && result.saturated_fat_g > result.fat_g) {
    rejectionReasons.push(`saturated fat (${result.saturated_fat_g}g) > fat (${result.fat_g}g)`);
    result.saturated_fat_g = null;
  }
  if ([result.protein_g, result.carbohydrates_g, result.fat_g].every((value) => value !== null) && result.protein_g + result.carbohydrates_g + result.fat_g > 110) {
    rejectionReasons.push(`protein + carbohydrates + fat exceeds 110g (${result.protein_g + result.carbohydrates_g + result.fat_g}g)`);
    result.protein_g = null;
    result.carbohydrates_g = null;
    result.fat_g = null;
  }
  return { nutrition: result, rejectionReasons };
}

function normalizeVisionResult(value) {
  const source = value && typeof value === 'object' ? value : {};
  const checked = validateNutrition(source.nutrition || {}, source.basis || 'unknown');
  return {
    serving_size: source.serving_size ? clean(source.serving_size) : null,
    basis: ['per_serve', 'per_100g', 'unknown'].includes(source.basis) ? source.basis : 'unknown',
    nutrition: checked.nutrition,
    ingredients: Array.isArray(source.ingredients) ? unique(source.ingredients) : [],
    confidence: ['high', 'medium', 'low'].includes(source.confidence) ? source.confidence : 'low',
    notes: clean(source.notes || ''),
    rejectionReasons: checked.rejectionReasons
  };
}

async function analyzeWithVisionLLM(imageBuffer, mimeType) {
  if (!siliconFlowClient) return null;
  const response = await siliconFlowClient.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-OCR',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` } },
        { type: 'text', text: visionPrompt }
      ]
    }],
    max_tokens: 2000
  });
  const text = response.choices?.[0]?.message?.content || '';
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!json) throw new Error('DeepSeek-OCR returned no JSON.');
  return normalizeVisionResult(JSON.parse(json));
}

function extractImageEvidence(html, sourceUrl, product) {
  const images = [];
  const add = (rawUrl, alt = '', allowEmptyAlt = false, metadata = {}) => {
    if (!allowEmptyAlt && !clean(alt)) return;
    if (!rawUrl || rawUrl.startsWith('data:')) return;
    try {
      const url = new URL(rawUrl.replace(/&amp;/g, '&'), sourceUrl).toString();
      if (!images.some((item) => item.url === url)) images.push({ url, alt: clean(alt) || 'Product image', ...metadata });
    } catch { /* ignore malformed image URLs */ }
  };
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  tags.forEach((tag) => {
    const get = (name) => tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1] || '';
    const alt = get('alt') || get('data-alt') || get('aria-label') || get('title');
    const raw = get('src') || get('data-src') || get('data-original');
    const srcset = get('srcset');
    const role = get('data-role');
    const width = Number(get('data-width') || 0);
    const height = Number(get('data-height') || 0);
    const position = Number(get('data-position') || 0);
    add(srcset ? srcset.split(',').pop().trim().split(/\s+/)[0] : raw, alt, Boolean(role), { role, width, height, position, score: Number(get('data-score') || 0) });
  });
  const jsonImages = Array.isArray(product.image) ? product.image : [product.image];
  jsonImages.filter(Boolean).forEach((image) => add(typeof image === 'object' ? (image.url || image.contentUrl) : image, 'Product image from structured data', true));
  return images
    .filter((item) => item.role === 'product-gallery' || (item.role === 'page-image' && (item.width >= 500 || item.height >= 500)) || /back|nutrition|ingredient|fssai|packaging|wafer|bar/i.test(`${item.alt} ${item.url}`))
    .map((item, index, all) => {
      const ratio = item.width && item.height ? item.width / item.height : 1;
      const position = item.position || index + 1;
      let score = Number(item.score || 0);
      if ((ratio >= 0.66 && ratio <= 0.82) || (ratio >= 0.44 && ratio <= 0.58)) score += 3;
      if (/back|nutrition|ingredients|label|_[3-6](?:\.|_|$)/i.test(`${item.alt} ${item.url}`)) score += 4;
      if (/back|nutrition|ingredients|label/i.test(item.alt)) score += 3;
      if (position >= 3 && position <= 8) score += 2;
      if (position === 1) score -= 2;
      if (ratio > 1.6) score -= 3;
      return { ...item, score, gallery_position: position, _candidate_count: all.length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

async function fetchImage(url) {
  await assertPublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 RawLabel/0.1', accept: 'image/*' } });
    if (!response.ok) throw new Error(`Image returned HTTP ${response.status}.`);
    if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('Image URL did not return an image.');
    if (Number(response.headers.get('content-length') || 0) > maxImageBytes) throw new Error('Image is too large.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxImageBytes) throw new Error('Image is too large.');
    const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    const isGif = buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
    const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isPng && !isJpeg && !isGif && !isWebp) throw new Error('Image format is not supported by the OCR engine.');
    if (isWebp) return { buffer: await sharp(buffer).png().toBuffer(), mimeType: 'image/png' };
    return { buffer, mimeType: contentType.split(';')[0] || (isPng ? 'image/png' : 'image/jpeg') };
  } finally { clearTimeout(timer); }
}

// OpenCV.js is intentionally avoided here: this backend needs a small, native Node path.
// Bradley-style adaptive thresholding keeps local contrast on colored packaging labels.
async function adaptiveThresholdBuffer(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .resize({ width: 2200, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += data[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row;
    }
  }
  const output = Buffer.alloc(width * height);
  const radius = 7;
  const constant = 10;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x1 = Math.max(0, x - radius); const y1 = Math.max(0, y - radius);
    const x2 = Math.min(width - 1, x + radius); const y2 = Math.min(height - 1, y + radius);
    const area = (x2 - x1 + 1) * (y2 - y1 + 1);
    const sum = integral[(y2 + 1) * (width + 1) + (x2 + 1)] - integral[y1 * (width + 1) + (x2 + 1)] - integral[(y2 + 1) * (width + 1) + x1] + integral[y1 * (width + 1) + x1];
    output[y * width + x] = data[y * width + x] > (sum / area - constant) ? 255 : 0;
  }
  return sharp(output, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function ocrProductImages(images) {
  const candidates = images.slice(0, 4);
  if (!candidates.length) return { text: '', sources: [], debugRecords: [] };
  const worker = await createWorker('eng');
  const sources = [];
  const debugRecords = [];
  const pass = async (image, passName, buffer) => {
    const result = await worker.recognize(buffer);
    const rawText = String(result.data.text || '').trim();
    const parsed = parseOcrEvidence(rawText);
    const record = {
      imageUrl: image.url,
      ocrPass: passName,
      rawText,
      tesseractConfidence: result.data.confidence ?? null,
      parsedFields: parsed.nutrition,
      rejectionReasons: [],
      source: 'tesseract'
    };
    debugRecords.push(record);
    return { rawText, parsed, confidence: result.data.confidence ?? null };
  };
  try {
    for (const image of candidates) {
      try {
        const downloaded = await fetchImage(image.url);
        const buffer = downloaded.buffer;
        await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
        const original = await pass(image, 'original', buffer);
        const enhancedBuffer = await sharp(buffer).resize({ width: 2200, withoutEnlargement: false }).grayscale().normalize().sharpen().png().toBuffer();
        await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        const enhanced = await pass(image, 'enhanced', enhancedBuffer);
        const adaptiveBuffer = await adaptiveThresholdBuffer(buffer);
        const adaptive = await pass(image, 'adaptive', adaptiveBuffer);
        const metadata = await sharp(buffer).metadata();
        let crop = { rawText: '', parsed: { ingredients: [], nutrition: {}, evidence: [] }, confidence: null };
        if (metadata.width && metadata.height && metadata.width >= 500 && metadata.height >= 300) {
          const cropWidth = Math.max(1, Math.floor(metadata.width * 0.68));
          const cropInput = await sharp(buffer).extract({ left: 0, top: 0, width: cropWidth, height: metadata.height }).png().toBuffer();
          crop = await pass(image, 'left-crop', await adaptiveThresholdBuffer(cropInput));
        }
        const mergedText = [original.rawText, enhanced.rawText, adaptive.rawText, crop.rawText].filter(Boolean).join('\n');
        const mergedParsed = parseOcrEvidence(mergedText);
        const parsedNutrition = {
          energy_kcal: finiteNumber(mergedParsed.nutrition.calories),
          protein_g: finiteNumber(mergedParsed.nutrition.protein),
          carbohydrates_g: finiteNumber(mergedParsed.nutrition.carbohydrates),
          total_sugar_g: finiteNumber(mergedParsed.nutrition.sugar),
          fat_g: finiteNumber(mergedParsed.nutrition.fat),
          saturated_fat_g: finiteNumber(mergedParsed.nutrition.saturated_fat),
          dietary_fiber_g: finiteNumber(mergedParsed.nutrition.fiber),
          sodium_mg: finiteNumber(mergedParsed.nutrition.sodium)
        };
        const checked = validateNutrition(parsedNutrition, /per\s+(?:serve|serving)/i.test(mergedText) ? 'per_serve' : 'per_100g');
        let candidate = { serving_size: mergedParsed.nutrition.serving_size || null, basis: /per\s+(?:serve|serving)/i.test(mergedText) ? 'per_serve' : 'unknown', nutrition: checked.nutrition, ingredients: mergedParsed.ingredients, confidence: 'medium', source: 'tesseract', rejectionReasons: checked.rejectionReasons };
        if (countNutritionFields(candidate.nutrition) < 3) {
          try {
            const vision = await analyzeWithVisionLLM(buffer, downloaded.mimeType);
            if (vision) {
              candidate = { ...vision, source: 'vision-llm' };
              debugRecords.push({ imageUrl: image.url, ocrPass: 'vision-llm', rawText: vision.notes, tesseractConfidence: null, parsedFields: vision.nutrition, rejectionReasons: vision.rejectionReasons, source: 'vision-llm', llmConfidence: vision.confidence });
            }
          } catch (error) {
            console.warn(`DeepSeek-OCR fallback failed for ${image.url}: ${error.message}`);
          }
        }
        const coverage = countNutritionFields(candidate.nutrition) + candidate.ingredients.length / 2;
        sources.push({ ...image, ocr_text: mergedText, parsed: candidate, coverage });
        debugRecords.filter((record) => record.imageUrl === image.url).forEach((record) => { record.rejectionReasons = candidate.rejectionReasons; });
      } catch (error) {
        sources.push({ ...image, ocr_text: '', ocr_error: error.message, parsed: { nutrition: {}, ingredients: [] }, coverage: 0 });
        debugRecords.push({ imageUrl: image.url, ocrPass: 'error', rawText: '', tesseractConfidence: null, parsedFields: {}, rejectionReasons: [error.message], source: 'tesseract' });
      }
    }
  } finally { await worker.terminate(); }
  const winner = sources.sort((a, b) => b.coverage - a.coverage)[0];
  return { text: winner?.ocr_text || sources.map((item) => item.ocr_text).join('\n'), sources, winner, debugRecords };
}

function splitIngredients(value) {
  const parts = []; let current = ''; let depth = 0;
  for (const character of value) { if (character === '(') depth += 1; if (character === ')') depth = Math.max(0, depth - 1); if ((character === ',' || character === ';') && depth === 0) { if (current.trim()) parts.push(current.trim()); current = ''; } else current += character; }
  if (current.trim()) parts.push(current.trim());
  return unique(parts).map((item) => item.replace(/^(ingredients?|contains)\s*[:\-]?\s*/i, '').trim()).filter((item) => item.length > 1 && !/^(nutrition facts|allergen information|may contain|best before|manufactured|storage)/i.test(item));
}

function parseOcrEvidence(ocrText) {
  if (!ocrText) return { ingredients: [], nutrition: {}, evidence: [] };
  const normalized = ocrText.replace(/\r/g, '').replace(/[ ]{2,}/g, ' ').replace(/[|]/g, 'I');
  const ingredientMatch = normalized.match(/ingredients?\s*[:\-]?\s*([\s\S]{1,1000}?)(?=\s*(?:[.;]\s*)?(?:nutrition facts|nutrition|storage instructions|allergen advice|may contain|best before|manufactured by|fssai)\b|$)/i);
  const ingredients = ingredientMatch ? splitIngredients(ingredientMatch[1].replace(/\n+/g, ' ')) : [];
  const numeric = '[0-9][0-9,.]*';
  const find = (patterns) => {
    const value = clean(numberFrom(normalized, patterns)).replace(/^[^0-9]+|[^0-9a-z.]+$/gi, '');
    return /\d/.test(value) ? value : '';
  };
  const nutritionLabels = /energy|calories?|protein|carbohydrate|carbs?|sugars?|fat|fibre|fiber|sodium/ig;
  const preferredColumn = /per\s+(?:serve|serving)/i.test(normalized) ? 1 : 0;
  const rowValue = (labels) => {
    for (const label of labels) {
      const labelPattern = new RegExp(label, 'i');
      const match = labelPattern.exec(normalized);
      if (!match) continue;
      const remainder = normalized.slice(match.index + match[0].length);
      const nextLabel = new RegExp(nutritionLabels.source, 'i').exec(remainder);
      const block = remainder.slice(0, nextLabel ? nextLabel.index : 100);
      const withoutColumnHeader = block.replace(/per\s*100\s*g(?:ram)?/gi, '');
      const values = [...withoutColumnHeader.matchAll(/[0-9][0-9,.]*/g)].map((item) => item[0]);
      const value = values[preferredColumn] || values[0] || '';
      if (value) return value;
    }
    return '';
  };
  const gap = '\\s*(?:\\([^)]*\\))?\\s*[:\\-]?\\s*';
  const nutrition = {
    serving_size: find([/serving\s*size\s*[:\-]?\s*([^\n,;]{1,30})/i]),
    calories: rowValue(['energy', 'calories']) || find([new RegExp(`(?:energy|calories?)${gap}(${numeric})\\s*(?:kcal|cal)?`, 'i')]),
    protein: rowValue(['protein']) || find([new RegExp(`protein${gap}(${numeric})\\s*g?`, 'i'), new RegExp(`(${numeric})\\s*g\\s+protein`, 'i')]),
    carbohydrates: rowValue(['carbohydrate', 'carbs?']) || find([new RegExp(`(?:carbohydrate|carbs?)${gap}(${numeric})\\s*g?`, 'i')]),
    sugar: rowValue(['total\\s+sugars?', 'sugars?']) || find([new RegExp(`(?:total\\s+)?sugars?${gap}(${numeric})\\s*g?`, 'i'), new RegExp(`(${numeric})\\s*g\\s+(?:total\\s+)?sugars?`, 'i')]),
    fat: rowValue(['total\\s+fat', 'fat']) || find([new RegExp(`(?:total\\s+)?fat${gap}(${numeric})\\s*g?`, 'i')]),
    saturated_fat: rowValue(['saturated\\s+fat']) || find([new RegExp(`saturated\\s+fat${gap}(${numeric})\\s*g?`, 'i')]),
    fiber: rowValue(['dietary\\s+fibre', 'dietary\\s+fiber', 'fibre', 'fiber']) || find([new RegExp(`(?:dietary\\s+)?f(?:iber|ibre)${gap}(${numeric})\\s*g?`, 'i')]),
    sodium: rowValue(['sodium']) || find([new RegExp(`sodium${gap}(${numeric})\\s*(?:mg|g)?`, 'i')])
  };
  const withUnit = (value, unit) => value && !/[a-z]/i.test(value) ? `${value} ${unit}` : value;
  nutrition.calories = withUnit(nutrition.calories, 'kcal');
  nutrition.protein = withUnit(nutrition.protein, 'g');
  nutrition.carbohydrates = withUnit(nutrition.carbohydrates, 'g');
  nutrition.sugar = withUnit(nutrition.sugar, 'g');
  nutrition.fat = withUnit(nutrition.fat, 'g');
  nutrition.saturated_fat = withUnit(nutrition.saturated_fat, 'g');
  nutrition.fiber = withUnit(nutrition.fiber, 'g');
  nutrition.sodium = withUnit(nutrition.sodium, 'mg');
  const evidence = [];
  if (ingredients.length) evidence.push({ fact: `Ingredients: ${ingredients.join(', ')}`, source: 'ocr_ingredient_panel', source_text: ingredientMatch[1].trim() });
  Object.entries(nutrition).forEach(([key, value]) => { if (value) evidence.push({ fact: `${key}: ${value}`, source: 'ocr_nutrition_panel', source_text: value }); });
  return { ingredients, nutrition, evidence, rejectionReasons: [] };
}

function candidateToEvidence(candidate) {
  const nutrition = candidate?.nutrition || {};
  const value = (key, unit) => nutrition[key] === null || nutrition[key] === undefined ? '' : `${nutrition[key]} ${unit}`;
  return {
    ingredients: candidate?.ingredients || [],
    nutrition: {
      serving_size: candidate?.serving_size || '',
      calories: value('energy_kcal', 'kcal'),
      protein: value('protein_g', 'g'),
      carbohydrates: value('carbohydrates_g', 'g'),
      sugar: value('total_sugar_g', 'g'),
      fat: value('fat_g', 'g'),
      saturated_fat: value('saturated_fat_g', 'g'),
      fiber: value('dietary_fiber_g', 'g'),
      sodium: value('sodium_mg', 'mg')
    },
    evidence: [],
    rejectionReasons: candidate?.rejectionReasons || []
  };
}

async function buildAnalysis({ html, sourceUrl, sourceType = 'url', uploadedFiles = [] }) {
  const text = clean(html);
  const objects = jsonLd(html);
  const product = objects.find((item) => Array.isArray(item['@type']) ? item['@type'].includes('Product') : item['@type'] === 'Product') || objects.find((item) => item.offers && item.name) || objects.find((item) => item.nutrition) || {};
  const imageEvidence = extractImageEvidence(html, sourceUrl, product);
  const ocr = (sourceType === 'url' || sourceType === 'extension') ? await ocrProductImages(imageEvidence) : { text: '', sources: [] };
  const ocrEvidence = ocr.winner?.parsed ? candidateToEvidence(ocr.winner.parsed) : parseOcrEvidence(ocr.text);
  const pageEvidence = parseOcrEvidence(text);
  if (!ocrEvidence.ingredients.length) ocrEvidence.ingredients = pageEvidence.ingredients;
  for (const [key, value] of Object.entries(pageEvidence.nutrition)) if (!ocrEvidence.nutrition[key] && value) ocrEvidence.nutrition[key] = value;
  if (!ocrEvidence.evidence.length) ocrEvidence.evidence = pageEvidence.evidence.map((item) => ({ ...item, source: 'page_text' }));
  imageEvidence.forEach((image) => { const match = ocr.sources.find((item) => item.url === image.url); if (match) Object.assign(image, { ocr_text: match.ocr_text || '', ocr_error: match.ocr_error || '' }); });
  const nutrition = product.nutrition || {};
  const offer = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
  const name = clean(product.name || firstMeta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').split('|')[0]) || 'Unknown product';
  const brand = clean(typeof product.brand === 'object' ? product.brand.name : product.brand || firstMeta(html, ['product:brand']));
  const ingredientsRaw = product.ingredients || product.recipeIngredient || firstMeta(html, ['food:ingredients']);
  const pageIngredients = Array.isArray(ingredientsRaw) ? unique(ingredientsRaw) : unique(String(ingredientsRaw || '').split(/[,;]+/));
  const ingredients = ocrEvidence.ingredients.length ? ocrEvidence.ingredients : pageIngredients;
  const calories = validNutritionValue(ocrEvidence.nutrition.calories || nutrition.calories || numberFrom(text, [/calories?\s*[:\-]?\s*([0-9][0-9.,]*\s*kcal)/i, /([0-9][0-9.,]*)\s*kcal/i]), 'kcal');
  const protein = validNutritionValue(ocrEvidence.nutrition.protein || nutrition.proteinContent || numberFrom(text, [/protein\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i, /([0-9][0-9.,]*\s*g)\s+protein/i]), 'g');
  const carbohydrates = validNutritionValue(ocrEvidence.nutrition.carbohydrates || nutrition.carbohydrateContent || numberFrom(text, [/(?:carbohydrate|carbs?)\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i]), 'g');
  const sugar = validNutritionValue(ocrEvidence.nutrition.sugar || nutrition.sugarContent || numberFrom(text, [/(?:total\s+)?sugars?\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i, /([0-9][0-9.,]*\s*g)\s+(?:total\s+)?sugars?/i]), 'g');
  const fat = validNutritionValue(ocrEvidence.nutrition.fat || nutrition.fatContent || numberFrom(text, [/total\s+fat\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i, /([0-9][0-9.,]*\s*g)\s+fat/i]), 'g');
  const saturatedFat = validNutritionValue(ocrEvidence.nutrition.saturated_fat || nutrition.saturatedFatContent || numberFrom(text, [/saturated\s+fat\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i]), 'g');
  const fiber = validNutritionValue(ocrEvidence.nutrition.fiber || nutrition.fiberContent || numberFrom(text, [/fiber\s*[:\-]?\s*([0-9][0-9.,]*\s*g)/i, /([0-9][0-9.,]*\s*g)\s+fiber/i]), 'g');
  const sodium = validNutritionValue(ocrEvidence.nutrition.sodium || nutrition.sodiumContent || numberFrom(text, [/sodium\s*[:\-]?\s*([0-9][0-9.,]*\s*(?:mg|g))/i]), 'mg');
  const serving = clean(ocrEvidence.nutrition.serving_size || nutrition.servingSize || numberFrom(text, [/serving\s+size\s*[:\-]?\s*([^.;]{1,30})/i]));
  const quantity = clean(product.size || product.weight || numberFrom(text, [/([\d.,]+\s*(?:g|kg|ml|l))\b/i]));
  const price = offer.price || numberFrom(text, [/(?:₹|Rs\.?|INR|\$|€|£)\s*([\d.,]+)/i]);
  const claims = ['high protein', 'low sugar', 'sugar free', 'no added sugar', 'natural', 'organic', 'healthy', 'premium', 'made with real fruit', 'made with real ingredients', 'immunity boosting', 'clinically tested', 'no preservatives', '100% natural', 'zero calories', 'sustainable', 'eco friendly', 'wholesome', 'guilt free'].filter((claim) => text.toLowerCase().includes(claim));
  const evidence = [];
  if (name !== 'Unknown product') evidence.push({ fact: `Product name: ${name}`, source: sourceType === 'url' ? 'product_page' : 'uploaded_image', source_text: name });
  if (protein) evidence.push({ fact: `Protein: ${protein}`, source: 'nutrition_table', source_text: protein });
  if (calories) evidence.push({ fact: `Calories: ${calories}`, source: 'nutrition_table', source_text: calories });
  if (ingredients.length) evidence.push({ fact: `Ingredients: ${ingredients.slice(0, 4).join(', ')}`, source: 'ingredient_list', source_text: ingredients.join(', ') });
  evidence.push(...ocrEvidence.evidence);
  const unknown = [];
  if (!protein) unknown.push('Protein was not found in the available source.');
  if (!calories) unknown.push('Calories were not found in the available source.');
  if (!ingredients.length) unknown.push('An ingredient list was not found in the available source.');
  if (!price) unknown.push('A current price was not found in the available source.');
  if (sourceType === 'images') unknown.push('OCR/vision is not configured yet, so image text remains unverified.');
  const claimsWithStatus = claims.map((claim) => ({ claim, status: claim.includes('protein') && protein ? 'SUPPORTED' : ['healthy', 'natural', 'premium', 'wholesome'].includes(claim) ? 'SUBJECTIVE' : 'UNCLEAR', evidence: [], explanation: 'Classification is limited to evidence found in the supplied source.' }));
  if (!ingredients.length && imageEvidence.some((item) => /back|ingredient|nutrition/i.test(item.alt))) unknown.push('The ingredient list appears to be printed inside a product image and was not present as DOM text.');
  return { source: { type: sourceType, url: sourceUrl || '', retrieved_at: new Date().toISOString(), uploaded_files: uploadedFiles }, product: { name, brand, category: clean(product.category || 'Food or beverage'), variant: '', description: clean(product.description || firstMeta(html, ['description', 'og:description'])), quantity }, pricing: { currency: price ? (text.includes('₹') || text.includes('Rs') ? 'INR' : 'UNKNOWN') : '', price: price || null, mrp: null, discount: null }, ingredients, nutrition: { serving_size: serving || null, calories: calories || null, protein: protein || null, carbohydrates: carbohydrates || null, sugar: sugar || null, fat: fat || null, saturated_fat: saturatedFat || null, fiber: fiber || null, sodium: sodium || null, source: ocr.winner?.parsed?.source || 'page-data' }, nutrition_source: ocr.winner?.parsed?.source || 'page-data', marketing_claims: claimsWithStatus, certifications: [], warnings: [], specifications: [], evidence, evidence_images: imageEvidence, unknown_information: unknown, rejectionReasons: ocrEvidence.rejectionReasons || [], debug: { ocrRecords: ocr.debugRecords || [] }, observations: claims.length ? [`The source emphasizes: ${claims.slice(0, 3).join(', ')}.`] : ['No explicit marketing claims were detected in the available source.'], analysis_status: 'EXTRACTED_WITH_EVIDENCE_LIMITS' };
}

async function handleUrl(req, res) {
  const body = JSON.parse((await readRequest(req)).toString('utf8'));
  const fetched = await fetchPublicPage(body.url);
  const analysis = await buildAnalysis({ html: fetched.html, sourceUrl: fetched.url });
  analysis.evidence.filter((item) => item.source === 'ocr_nutrition_panel').forEach((item) => {
    const [key, ...value] = item.fact.split(':');
    if (key && value.length) analysis.nutrition[key.trim()] = value.join(':').trim();
  });
  if (analysis.evidence.some((item) => item.source.startsWith('ocr_'))) analysis.analysis_status = 'DOM_PLUS_OCR_EVIDENCE';
  send(res, 200, analysis);
}

async function handleImages(req, res) {
  const body = await readRequest(req);
  const contentType = req.headers['content-type'] || '';
  const files = [...body.toString('latin1').matchAll(/filename="([^"]+)"/g)].map((match) => match[1]).slice(0, 5);
  if (!contentType.includes('multipart/form-data') || !files.length) throw new Error('Upload at least one product image.');
  send(res, 200, await buildAnalysis({ html: '', sourceType: 'images', uploadedFiles: files }));
}

async function handleExtension(req, res) {
  const payload = JSON.parse((await readRequest(req)).toString('utf8'));
  if (!payload.url || !Array.isArray(payload.images) || !Array.isArray(payload.structured)) throw new Error('The extension sent incomplete page evidence.');
  const safeJson = JSON.stringify(payload.structured).replace(/</g, '\\u003c');
  const imageTags = payload.images.map((image) => `<img src="${String(image.url || '').replace(/"/g, '&quot;')}" alt="${String(image.alt || '').replace(/"/g, '&quot;')}" data-role="${String(image.role || '').replace(/"/g, '&quot;')}" data-width="${Number(image.width || 0)}" data-height="${Number(image.height || 0)}" data-score="${Number(image.score || 0)}" data-position="${Number(image.position || 0)}">`).join('');
  const html = `<title>${payload.title || ''}</title><meta name="description" content="${payload.description || ''}"><script type="application/ld+json">${safeJson}</script>${imageTags}<main>${payload.pageText || ''}</main>`;
  send(res, 200, await buildAnalysis({ html, sourceUrl: payload.url, sourceType: 'extension' }));
}

async function serve(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root)) return send(res, 403, { error: 'Forbidden.' });
  try { const file = await readFile(filePath); send(res, 200, file, contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'); } catch { send(res, 404, { error: 'Not found.' }); }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.method === 'POST' && url.pathname === '/api/analyze/url') return await handleUrl(req, res);
    if (req.method === 'POST' && url.pathname === '/api/analyze/images') return await handleImages(req, res);
    if (req.method === 'POST' && url.pathname === '/api/analyze/extension') return await handleExtension(req, res);
    if (req.method === 'GET') return await serve(req, res, url.pathname);
    send(res, 405, { error: 'Method not allowed.' });
  } catch (error) { send(res, 400, { error: error.name === 'AbortError' ? 'The product page took too long to respond.' : error.message || 'Analysis failed.' }); }
});

server.listen(port, '127.0.0.1', () => console.log(`RawLabel running at http://localhost:${port}`));
