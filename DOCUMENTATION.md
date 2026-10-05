# RawLabel Documentation

## 1. What RawLabel Does

RawLabel reads a food product page and creates a shorter, evidence-based view of what is actually being sold.

It currently extracts:

- Product name and quantity.
- Ingredient text.
- Nutrition values.
- Marketing claims.
- Packaging images used as evidence.
- Fields that could not be verified.

The Chrome extension is the recommended workflow for Amazon, Kiwla, and other JavaScript-heavy shopping pages.

## 2. Requirements

- Windows with PowerShell.
- Node.js installed.
- Google Chrome.
- Project dependencies installed.

PowerShell may block `npm.ps1`. Use `npm.cmd` instead of `npm`.

## 3. Install Dependencies

From the project folder:

```powershell
npm.cmd install
```

The important runtime packages are:

```text
tesseract.js
sharp
```

## Environment Variables

`SILICONFLOW_API_KEY` is optional. When set, it enables the SiliconFlow DeepSeek-OCR vision fallback for images where Tesseract extracts fewer than three nutrition fields. When absent, RawLabel continues with local Tesseract OCR and does not fail.

Get a free key at: https://cloud.siliconflow.cn/account/ak

PowerShell for the current terminal session:

```powershell
$env:SILICONFLOW_API_KEY = "sk-your-key-here"
```

Start the backend in the same terminal after setting the variable:

```powershell
npm.cmd start
```

The key is read only by the backend. It is never sent to the Chrome extension or browser page.

## 4. Start the Backend

From:

```text
C:\Users\rehra\Documents\Vibe Code\NoFluff
```

run:

```powershell
npm.cmd start
```

Expected output:

```text
RawLabel running at http://localhost:4173
```

Keep this terminal open while using the extension. If port `4173` is already in use, the backend is probably already running. Verify by opening:

```text
http://localhost:4173
```

## 5. Load or Reload the Chrome Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** the first time.
4. Select:

```text
C:\Users\rehra\Documents\Vibe Code\NoFluff\extension
```

5. After code changes, click **Reload** on RawLabel.

The Manifest V3 service worker may show `inactive`. That is normal; Chrome suspends idle service workers and wakes them when an extension event occurs.

## 6. Analyze a Product Page

1. Open the product page in a normal browser tab.
2. Wait for the product gallery and detail sections to load.
3. Click the RawLabel toolbar icon from that product tab.
4. Click **Analyze current page** in the Side Panel.
5. Wait for OCR to finish. Image-heavy pages may take longer because several image variants are processed.

After changing extension code, reload the extension and refresh the product page before testing again.

## 7. How a Result Is Produced

The extension reads the page only after the user clicks Analyze. It sends:

- Rendered product-detail text.
- JSON-LD structured data.
- Product title.
- High-resolution packaging image URLs.
- Image role and dimensions.

The backend then:

1. Selects product-gallery or sufficiently large page images.
2. Downloads and validates image bytes.
3. Runs original-image OCR.
4. Runs enhanced OCR after Sharp preprocessing.
5. Runs a cropped panel OCR pass when appropriate.
6. Chooses the strongest OCR text.
7. Parses ingredient sections and nutrition rows.
8. Chooses the serving column when the table declares `per serve`.
9. Validates nutrition ranges and cross-field relationships.
10. Uses the optional SiliconFlow DeepSeek-OCR fallback when fewer than three nutrition fields survive Tesseract parsing.
11. Returns the result, evidence, and collapsed development debug records.

## 8. Understanding Nutrition Values

Nutrition tables often contain more than one numeric value per row. For example:

```text
ENERGY (kcal)      418       401       20%
                   per 100 g  per serve RDA
```

RawLabel displays the `per serve` value when the table clearly declares a serving column. For this example, the result should be `401 kcal`, not `418 kcal`.

If there is no explicit serving column, RawLabel uses the first numeric value it can support and should identify the serving context where available. Values rejected by plausibility rules appear in the Debug section.

## 9. Troubleshooting

### `Failed to fetch`

The local backend is not reachable. Start it with:

```powershell
npm.cmd start
```

Then reload the extension.

### `EADDRINUSE: 127.0.0.1:4173`

Another backend instance is already running. Open `http://localhost:4173` instead of starting a second instance.

### `Open a normal product webpage before analyzing it`

The extension was not attached to a normal HTTP/HTTPS tab. Open the product page first, click the toolbar icon from that tab, and analyze again.

### Nutrition cards are `Unknown`

Check the Packaging evidence section and expand **Debug**. The records show whether the failure happened during image download, Tesseract OCR, parsing, validation, or the optional DeepSeek-OCR fallback. Reload the extension, refresh the product page, and analyze again. Very small, rotated, compressed, or heavily distorted images remain difficult even after preprocessing.

### Debug records show no DeepSeek-OCR fallback

Set `SILICONFLOW_API_KEY` in the same PowerShell terminal used to start the backend. If the key is absent, this is expected and RawLabel uses Tesseract only.

### Product name and image do not match

Close and reopen the Side Panel from the intended product tab. The extension stores the tab that opened the panel, but a stale panel can retain an older result until a new analysis is started.

### Service worker is inactive

This is expected Manifest V3 behavior and is not an error by itself.

## 10. Development Checks

Run syntax checks after editing:

```powershell
node --check server.js
node --check extension/background.js
node --check extension/sidepanel.js
```

Verify the local server:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4173/
```

Expected status: `200`.

## 11. Current Scope

The current scope is food-product pages and packaging images. The system does not yet promise reliable analysis for cosmetics, supplements, cleaning products, electronics, financial products, or medical claims.

RawLabel reports extracted evidence and uncertainty. It does not decide whether a product is medically safe or personally suitable.
