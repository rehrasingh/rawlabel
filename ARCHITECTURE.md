# RawLabel Architecture

## 1. Purpose

RawLabel translates food-product marketing and packaging into a compact, evidence-linked raw label.

The current product is a browser-first MVP. The primary workflow is a Chrome extension Side Panel that analyzes the rendered product page the user is currently viewing. A local Node backend performs image retrieval, preprocessing, OCR, parsing, and response assembly.

The system is intentionally evidence-first:

- Values found in the page or packaging image are reported as extracted facts.
- Values that cannot be supported by supplied evidence remain unknown.
- Marketing claims are kept separate from nutrition and ingredient facts.
- OCR text is treated as evidence, not as unquestioned truth.

## 2. System Context

```text
User opens food product page in Chrome
                |
                v
       RawLabel Chrome Extension
       - remembers target tab
       - reads rendered DOM on click
       - collects structured data and images
       - displays Side Panel result
                |
                | POST /api/analyze/extension
                v
          Local Node Backend
          - validates request
          - extracts product/page evidence
          - selects packaging images
          - downloads public images
          - preprocesses images with Sharp
          - runs Tesseract.js OCR
          - parses ingredients and nutrition rows
          - returns structured analysis
```

The static website remains available for direct URL and image workflows, but difficult e-commerce pages are analyzed through the extension because the browser has already rendered their DOM and image gallery.

## 3. Repository Components

### Website

- `index.html`: static application shell.
- `styles.css`: website presentation.
- `app.js`: direct URL/image workflow and result rendering.

### Backend

- `server.js`: Node HTTP server, API routes, URL security, extraction, OCR, parsing, and static-file serving.
- `package.json`: scripts and runtime dependencies.

Runtime dependencies:

- `tesseract.js`: OCR engine.
- `sharp`: image resizing, grayscale conversion, normalization, sharpening, thresholding, and cropping.
- `playwright`: available for future browser-rendering work; the current extension flow uses the user's Chrome renderer.

The backend calls SiliconFlow's OpenAI-compatible API with the official `openai` SDK when `SILICONFLOW_API_KEY` is present. The fallback model is `deepseek-ai/DeepSeek-OCR`.

### Chrome Extension

- `extension/manifest.json`: Manifest V3 permissions and Side Panel configuration.
- `extension/background.js`: opens the Side Panel from the toolbar gesture and stores the target tab ID.
- `extension/sidepanel.html`: Side Panel structure.
- `extension/sidepanel.css`: compact result interface.
- `extension/sidepanel.js`: rendered DOM extraction, image selection, backend request, and result rendering.

## 4. Extension Data Flow

### 4.1 Selecting the page

When the user clicks the toolbar icon, the background service worker:

1. Opens the Side Panel immediately while Chrome still recognizes the toolbar click as a user gesture.
2. Stores the clicked tab ID and window ID in `chrome.storage.session`.

When the user clicks **Analyze current page**, the Side Panel:

1. Loads the stored target tab.
2. Falls back to the active normal browser tab if the stored tab no longer exists.
3. Executes an extraction function in the product tab with `chrome.scripting.executeScript`.

### 4.2 Rendered page extraction

The extraction function collects:

- Current URL.
- Product title, preferring Amazon's `#productTitle`.
- Meta description.
- JSON-LD structured data.
- Product-detail text from Amazon selectors such as `#centerCol`, `#productDetails`, and `#feature-bullets`.
- Product images and image dimensions.

The extractor avoids using the entire page body when product-detail regions are available. This reduces contamination from recommendations, reviews, and unrelated page copy.

### 4.3 Image selection

For Amazon pages, image candidates are collected from:

- `#imageBlock_feature_div`.
- `#imageBlock`.
- `#altImages`.
- `#main-image-container`.
- `#landingImage`.
- `#imgTagWrapperId`.
- `data-old-hires` and `data-a-dynamic-image` metadata.
- Relevant inline image-block metadata such as `colorImages`.

Amazon thumbnail transforms such as `._AC_UL320_.` are removed when possible to request a larger image.

For non-Amazon pages, large rendered images are retained even when their `alt` attribute is empty. This matters because packaging images frequently have no useful accessibility text.

Each image carries:

- URL.
- Alt text.
- Role (`product-gallery` or `page-image`).
- Width and height.
- Selection score.

The backend retains up to 16 evidence images and sends up to 16 candidates through OCR.

## 5. Backend OCR Pipeline

```text
Image URL
   |
   v
Public URL and content validation
   |
   v
Download image bytes
   |
   v
Format signature validation
   |
   v
Tesseract original image pass
   |
   v
Sharp preprocessing
   - resize to 2200px wide
   - grayscale
   - normalize contrast
   - sharpen
   - Bradley-style adaptive threshold for dense labels
   |
   v
Tesseract table-oriented pass
   |
   v
Optional left-panel crop pass
   |
   v
Choose OCR text with strongest nutrition/ingredient signal
   |
   v
Nutrition-row and ingredient parsing
```

The left-panel crop is useful for packaging layouts where the nutrition facts occupy one side of a larger back-of-pack image.

Invalid image payloads are rejected before OCR. PNG, JPEG, GIF, and WebP are accepted; WebP is converted to PNG in memory before OCR.

If Tesseract produces fewer than three nutrition fields for an image and `SILICONFLOW_API_KEY` is configured, the same image is sent to DeepSeek-OCR using the strict JSON extraction prompt. DeepSeek-OCR is a fallback, not a replacement for Tesseract. Without a key, the fallback logs a warning and the local OCR result remains authoritative.

## 6. Nutrition Parsing

The parser supports both inline and table-shaped OCR output.

Inline example:

```text
Protein (g) 9.4
```

Table example:

```text
PROTEIN (g)
9.4
9
```

When a table declares `per 100 g` and `per serve`, the parser selects the `per serve` column for the result cards. If no serving column is declared, it uses the first available numeric value. Nutrition rows are parsed across line breaks, allowing OCR output such as a label on one line and its values on the next lines.

Parsed values pass field ranges and cross-field checks. Rejected values are set to null and returned in `rejectionReasons`.

The supported fields are:

- Calories/energy.
- Protein.
- Carbohydrates.
- Total sugar.
- Fat.
- Dietary fibre/fiber.
- Sodium.
- Serving size when available.

Numeric validation prevents malformed OCR such as `.` from being displayed as `. g`.

## 7. Evidence Precedence

For each field, the current precedence is:

1. Parsed OCR from selected packaging images.
2. Nutrition values from product structured data.
3. Nutrition values parsed from product-detail page text.
4. Unknown.

Ingredients follow the same general pattern, with OCR ingredient text preferred over page-derived ingredient text when OCR finds a usable ingredient section.

The API also returns evidence images and evidence records so the UI can show where extracted information came from.

Development responses also include `debug.ocrRecords`. Each record identifies the image, OCR pass, raw OCR text, Tesseract confidence, parsed fields, rejection reasons, and whether the final fallback source was Tesseract or DeepSeek-OCR.

## 8. API Surface

### `POST /api/analyze/extension`

Primary extension endpoint. Expected JSON includes:

```json
{
  "url": "https://example.com/product",
  "title": "Product title",
  "description": "Page description",
  "pageText": "Rendered product-detail text",
  "structured": [],
  "images": []
}
```

### `POST /api/analyze/url`

Fetches and analyzes a public HTML product page from the backend.

### `POST /api/analyze/images`

Accepts multipart image uploads. This route is retained for the website workflow; the extension path is currently the stronger food-product workflow because it has access to rendered product-page evidence.

## 9. Security and Reliability Boundaries

The backend:

- Accepts only HTTP and HTTPS product URLs.
- Blocks localhost, private IP ranges, link-local addresses, and private redirects.
- Limits redirects, request size, page size, image size, and fetch time.
- Validates image content type and file signatures.
- Sends permissive CORS headers for the local extension prototype.

Before production, CORS must be restricted, rate limiting added, request authentication considered, and image retention/privacy decisions documented.

## 10. Known Limitations

- OCR quality depends on the source image resolution, contrast, rotation, and format.
- WebP conversion adds processing time and may still fail for malformed CDN responses.
- OCR may confuse adjacent nutrition columns or percentages when the table is heavily distorted.
- DeepSeek-OCR fallback requires a configured SiliconFlow API key and network access; it is intentionally skipped when the key is absent.
- It does not bypass login walls, CAPTCHAs, or restricted product pages.
- The Side Panel requires the local backend to remain running.
- The current result is extraction-focused and is not medical, dietary, or legal advice.

## 11. Next Architectural Steps

1. Add a browser-side image fetch/conversion path for protected CDN images.
2. Add automated fixtures for Amazon, Kiwla, and red-background nutrition tables.
3. Move OCR to a dedicated worker/offscreen architecture if the backend should no longer process image bytes.
4. Add explicit column headers and source labels to the UI (`per serve`, `per 100 g`, or `unknown`).
