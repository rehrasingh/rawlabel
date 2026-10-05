const analyzeButton = document.getElementById('analyze-button');
const result = document.getElementById('result');
const errorBox = document.getElementById('error-box');
const pageLabel = document.getElementById('page-label');
const headerStatus = document.getElementById('header-status');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const list = (items, empty) => items?.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : `<li>${empty}</li>`;

function extractRenderedPage() {
  const meta = (name) => document.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.content || '';
  const structured = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) => {
    try { const value = JSON.parse(node.textContent); return Array.isArray(value) ? value : [value]; } catch { return []; }
  });
  const highResolution = (rawUrl) => {
    if (!rawUrl || rawUrl.startsWith('data:')) return '';
    try {
      const url = new URL(rawUrl, location.href);
      // Amazon adds thumbnail transforms such as ._AC_UL320_. to gallery URLs.
      url.pathname = url.pathname.replace(/\._(?:SS|SX|SY|AC|UL)\d+_\.(?=[a-z0-9]{2,5}$)/i, '._SL1500_.');
      url.pathname = url.pathname.replace(/\._[^/.]+_\.(?=[a-z0-9]{2,5}$)/i, '.');
      return url.toString();
    } catch { return rawUrl; }
  };
  const imageRecords = new Map();
  const addImage = (image, role, extra = {}) => {
    const url = highResolution(image?.url || image);
    if (!url || url.startsWith('data:')) return;
    const alt = image?.alt || '';
    const width = Number(image?.width || 0);
    const height = Number(image?.height || 0);
    const score = Number(extra.score || 0) + (width >= 500 || height >= 500 ? 3 : 0) + (/back|nutrition|ingredient|fssai|label/i.test(alt) ? 8 : 0);
    const previous = imageRecords.get(url);
    if (!previous || score > previous.score) imageRecords.set(url, { url, alt, role, width, height, score, position: Number(extra.position || 0) });
  };

  // Restrict Amazon extraction to the product gallery. This excludes "customers also viewed"
  // tiles and review images that happen to contain food-related words.
  const gallery = [...document.querySelectorAll('#imageBlock_feature_div img, #imageBlock img, #altImages img, #main-image-container img, #landingImage, #imgTagWrapperId img, #imageBlock img[data-a-image-name="landingImage"]')];
  gallery.forEach((element, index) => {
    addImage({
      url: element.getAttribute('data-old-hires') || element.currentSrc || element.src || element.dataset.src || '',
      alt: element.alt || element.getAttribute('data-alt') || element.getAttribute('aria-label') || element.title || '',
      width: element.naturalWidth || element.width,
      height: element.naturalHeight || element.height
    }, 'product-gallery', { score: index === 0 ? 12 : 20, position: index + 1 });
    const dynamic = element.getAttribute('data-a-dynamic-image');
    if (dynamic) {
      try { Object.keys(JSON.parse(dynamic)).forEach((url) => addImage({ url, alt: element.alt, width: 1500, height: 1500 }, 'product-gallery', { score: index === 0 ? 15 : 23, position: index + 1 })); } catch { /* ignore malformed Amazon metadata */ }
    }
  });

  // Amazon also stores the complete gallery in inline image-block metadata.
  // Those URLs include back-panel images that may not be rendered as thumbnails yet.
  if (/amazon\./i.test(location.hostname)) {
    [...document.scripts]
      .map((script) => script.textContent || '')
      .filter((text) => /colorImages|imageBlock|ImageBlockATF/i.test(text))
      .flatMap((text) => text.replace(/\\\//g, '/').match(/https?:\\?\/\\?\/[^"'\\s\\]+?\.(?:jpg|jpeg|png)(?:[^"'\\s\\}]*)?/gi) || [])
      .forEach((url) => addImage({ url, alt: 'Amazon product gallery image', width: 1500, height: 1500 }, 'product-gallery', { score: 18 }));
  }

  // Keep a small fallback for non-Amazon stores, but score it below a real gallery image.
  if (!gallery.length) [...document.images].forEach((image) => addImage({
    url: image.currentSrc || image.src || image.dataset.src || '',
    alt: image.alt || image.getAttribute('data-alt') || image.getAttribute('aria-label') || image.title || '',
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  }, 'page-image', { score: 4 }));

  const images = [...imageRecords.values()]
    .filter((image) => image.role === 'product-gallery' || (image.role === 'page-image' && (image.width >= 500 || image.height >= 500)) || /back|nutrition|ingredient|fssai|packaging|label/i.test(`${image.alt} ${image.url}`))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const detailSelectors = ['#centerCol', '#feature-bullets', '#productDetails', '#detailBullets_feature_div', '#productOverview_feature_div', '#nutritionFactsDesktop', '#importantInformation'];
  const detailText = detailSelectors
    .map((selector) => document.querySelector(selector)?.innerText || '')
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join('\n');
  return {
    url: location.href,
    title: document.querySelector('#productTitle')?.textContent?.trim() || document.title,
    description: meta('description') || meta('og:description'),
    pageText: (detailText || document.body?.innerText || '').slice(0, 40000),
    structured,
    images
  };
}

function render(data) {
  const product = data.product || {};
  const nutrition = data.nutrition || {};
  const claims = data.marketing_claims || [];
  const values = [['Protein', nutrition.protein], ['Calories', nutrition.calories], ['Carbs', nutrition.carbohydrates], ['Sugar', nutrition.sugar], ['Fat', nutrition.fat], ['Sodium', nutrition.sodium]];
  const facts = values.map(([label, value]) => `<div class="fact"><label>${label}</label><strong>${escapeHtml(value || 'Unknown')}</strong><small>${escapeHtml(nutrition.serving_size || 'source serving')}</small></div>`).join('');
  const claimsHtml = claims.length ? claims.map((claim) => `<div class="claim"><span class="claim-mark ${claim.status === 'SUPPORTED' ? 'good' : ''}">${claim.status === 'SUPPORTED' ? '✓' : '?'}</span><div><strong>${escapeHtml(claim.claim)} · ${escapeHtml(claim.status)}</strong><small>${escapeHtml(claim.explanation || 'Evidence is shown in the source section.')}</small></div></div>`).join('') : '<p class="product-meta">No marketing claims detected.</p>';
  const images = (data.evidence_images || []).map((image) => `<a class="source-image" href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" /><span>${escapeHtml(image.alt)}</span></a>`).join('');
  result.innerHTML = `<div class="eyebrow">RAW LABEL RESULT</div><h2 class="product-name">${escapeHtml(product.name || 'Unknown product')}</h2><p class="product-meta">${escapeHtml(product.brand || 'Brand unknown')} · ${escapeHtml(product.quantity || 'Quantity unknown')} · ${escapeHtml(data.source?.url || 'Current page')}</p><div class="fact-grid">${facts}</div><details class="result-section" open><summary>Ingredients <span>${data.ingredients?.length || 0} found</span></summary><div class="section-body"><ol class="ingredients">${list(data.ingredients, 'Ingredient list not found in available evidence.')}</ol></div></details><details class="result-section"><summary>Marketing claims <span>${claims.length} found</span></summary><div class="section-body">${claimsHtml}</div></details><details class="result-section"><summary>Packaging evidence <span>${data.evidence_images?.length || 0} images</span></summary><div class="section-body">${images ? `<div class="source-images">${images}</div>` : '<p class="product-meta">No relevant packaging images found.</p>'}</div></details><div class="unknown"><strong>What could not be verified</strong><ul>${list(data.unknown_information, 'Nothing marked unknown.')}</ul></div>`;
  const debugRecords = data.debug?.ocrRecords || [];
  const debugHtml = debugRecords.length ? debugRecords.map((record) => `<article class="debug-record"><strong>${escapeHtml(record.ocrPass || 'OCR')} · ${escapeHtml(record.source || 'unknown')}${record.llmConfidence ? ` · ${escapeHtml(record.llmConfidence)}` : ''}</strong><small>Confidence: ${escapeHtml(record.tesseractConfidence ?? 'n/a')} · ${escapeHtml(record.imageUrl || '')}</small><pre>${escapeHtml((record.rawText || '').slice(0, 1800) || 'No OCR text')}</pre>${record.rejectionReasons?.length ? `<ul>${list(record.rejectionReasons, '')}</ul>` : ''}</article>`).join('') : '<p class="product-meta">No OCR records were returned.</p>';
  result.insertAdjacentHTML('beforeend', `<details class="result-section debug-section"><summary>Debug <span>${debugRecords.length} OCR records</span></summary><div class="section-body">${debugHtml}</div></details>`);
  result.hidden = false;
}

async function analyzeCurrentPage() {
  analyzeButton.disabled = true;
  errorBox.hidden = true;
  result.hidden = true;
  headerStatus.textContent = 'READING';
  pageLabel.textContent = 'Reading rendered DOM, structured data, and packaging images...';
  try {
    const stored = await chrome.storage.session.get(['rawLabelTargetTabId', 'rawLabelTargetWindowId']);
    let tab = stored.rawLabelTargetTabId ? await chrome.tabs.get(stored.rawLabelTargetTabId).catch(() => null) : null;
    if (!tab) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' });
      tab = tabs.find((candidate) => candidate.id && candidate.url && /^https?:/.test(candidate.url)) || tabs[0];
    }
    if (!tab?.id) throw new Error('No active browser tab was found. Open a product page and try again.');
    const [{ result: extracted }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractRenderedPage });
    if (!extracted?.url || !/^https?:/.test(extracted.url)) throw new Error('This page cannot be analyzed. Open a normal product webpage and try again.');
    let response;
    try {
      response = await fetch('http://127.0.0.1:4173/api/analyze/extension', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(extracted) });
    } catch {
      throw new Error('RawLabel backend is not running. Open a terminal in the project folder and run: npm.cmd start');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The RawLabel backend could not analyze this page.');
    render(data);
    headerStatus.textContent = 'ANALYZED';
    pageLabel.textContent = extracted.title || extracted.url;
  } catch (error) {
    errorBox.textContent = error.message || 'Unable to analyze this page.';
    errorBox.hidden = false;
    headerStatus.textContent = 'ERROR';
    pageLabel.textContent = 'Try a public product page or upload a screenshot instead.';
  } finally { analyzeButton.disabled = false; }
}

analyzeButton.addEventListener('click', analyzeCurrentPage);
