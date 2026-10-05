# RawLabel

RawLabel is a browser-first MVP for translating product marketing into evidence-backed, plain-language product information.

## Run locally

Use the backend so URL and image submissions reach the API:

```powershell
npm.cmd start
```

Then open [http://localhost:4173](http://localhost:4173). `npm.cmd` is recommended in PowerShell when script execution policy blocks `npm.ps1`.

## Current MVP behavior

- Paste a public `http://` or `https://` product URL and receive analysis extracted from that page.
- OCR relevant back-of-pack images with `tesseract.js` when ingredients or nutrition are not present as DOM text.
- Preprocess difficult packaging images with `sharp`, including WebP conversion, adaptive thresholding, and panel cropping.
- Optionally use SiliconFlow DeepSeek-OCR when `SILICONFLOW_API_KEY` is configured and local OCR finds fewer than three nutrition fields.
- Upload up to five product images at once.
- Validate image type and 10 MB per-file size before analysis.
- Show staged analysis feedback without fake progress percentages.
- Present an original marketing view beside a monochrome, fact-only Raw Label visual.
- Separate facts, marketing claims, interpretations, evidence, and unknown information.
- Explain source evidence and the product truth hierarchy in the result view.
- Provide graceful browser-side validation for invalid URLs and unsupported files.

## Backend notes

`server.js` is a built-in Node HTTP backend. It serves the website and exposes:

- `POST /api/analyze/url` for public product pages
- `POST /api/analyze/images` for multiple image uploads
- `POST /api/analyze/extension` for rendered DOM evidence from the Chrome extension

URL retrieval includes HTTP/HTTPS validation, private-network blocking, redirect validation, timeouts, and a response-size limit. The extension analysis path performs local Tesseract OCR and uses SiliconFlow DeepSeek-OCR only as an optional fallback. The image upload route remains conservative and does not yet claim to perform OCR.

Production work still required: stronger image preprocessing/vision for difficult packaging, structured AI extraction, schema validation, rate limiting, secure image retention, persistence decisions, and automated tests. API keys must remain server-side.

## Load the Chrome extension

1. Run `npm.cmd start` so the backend is available at `http://localhost:4173`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder.
5. Open a product page, click the RawLabel extension icon, and click **Analyze current page** in the Side Panel.

The extension reads the rendered page only after the user clicks Analyze. It does not bypass CAPTCHA, login walls, or restricted pages.
