# RawLabel

## Product Goal & Complete Build Specification

---

# 1. Product Vision

Build a website called **RawLabel** that helps consumers see beyond product marketing.

A user can provide either:

1. A **product URL**
2. A **photo/screenshot of the product or packaging**

RawLabel analyzes the available information and converts the marketing-heavy presentation into a simple, transparent explanation of what the product actually contains and what is being advertised.

The central idea is:

> **See past the marketing.**

Or more directly:

> **What would this product look like if the marketing was stripped away?**

RawLabel should help users distinguish between:

* What the company says
* What the product actually contains
* What can be verified
* What cannot be verified
* What information is emphasized by marketing
* What important information may be less prominent

---

# 2. The Signature Feature

The defining feature of RawLabel is an **AI-generated neutral product representation**.

After analyzing the product, RawLabel should generate a simple product visual that represents the product **without promotional marketing language**.

Instead of reproducing:

> "HIGH PROTEIN"

> "PREMIUM"

> "100% NATURAL"

> "IMMUNITY BOOST"

> "NEW & IMPROVED"

> "EXTRA POWER"

the generated representation should be visually simple and information-focused.

For example:

```text
             RAW LABEL

        ┌───────────────────┐
        │                   │
        │    PRODUCT NAME   │
        │                   │
        │     250 kcal      │
        │     20g protein   │
        │     8g sugar      │
        │                   │
        │   60g / serving   │
        │                   │
        └───────────────────┘
```

The visual style should generally be:

* Minimal
* Monochrome / black and white
* Clean
* Neutral
* Information-focused
* Free from promotional imagery
* Free from exaggerated claims
* Free from unnecessary branding

The purpose is not to create a fake replacement package.

The purpose is to create a **visual interpretation of the product after stripping away marketing persuasion**.

---

# 3. Important Rule About the Generated Product Image

The AI-generated visual must NOT invent product facts.

It must be based only on information extracted from:

* The supplied product URL
* The uploaded image
* Other verified evidence available to the application

If the source says:

> 20g protein

the visual may show:

> 20g protein

If the source does not provide protein information:

> Protein: Unknown

Do not invent a value.

Likewise, the generated visual must not claim:

> "This product is unhealthy."

or:

> "This company is lying."

The visual should communicate **neutrality**, not accusation.

---

# 4. Example User Experience

A user visits RawLabel.

They see:

> # See past the marketing.
>
> Paste a product link or upload a product image.

Two input options:

```text
┌──────────────────────────┐
│                          │
│     🔗 Product URL       │
│                          │
│  Paste a product link    │
│                          │
└──────────────────────────┘

             OR

┌──────────────────────────┐
│                          │
│     📷 Product Image     │
│                          │
│  Upload a package/photo  │
│                          │
└──────────────────────────┘
```

The user provides either one.

RawLabel analyzes the information.

Then the result contains:

```text
Original Product
       ↓
Marketing Analysis
       ↓
RAW LABEL
       ↓
AI Neutral Product Visual
       ↓
"What you're actually getting"
```

---

# 5. Primary Analysis Pipeline

The overall system should work like this:

```text
                 USER INPUT
                     |
          ┌──────────┴──────────┐
          |                     |
     PRODUCT URL            PRODUCT IMAGE
          |                     |
          ↓                     ↓
    Web Retrieval          Vision/OCR
          |                     |
          └──────────┬──────────┘
                     ↓
             Product Extraction
                     ↓
              Structured Data
                     ↓
             Marketing Claims
                     ↓
             Evidence Analysis
                     ↓
               RAW LABEL
                     ↓
          Neutral Product Visual
                     ↓
              User Interface
```

---

# 6. MVP Scope

The MVP should support both:

### Input A — Product URL

Example:

```text
https://example.com/product/xyz
```

### Input B — Product Image

Examples:

* Product packaging
* Advertisement
* Product screenshot
* Front-of-pack image
* Back-of-pack image
* Ecommerce screenshot

The initial product category should primarily focus on:

* Food
* Beverages
* Snacks
* Protein products
* Packaged consumer products

The architecture should be designed so other categories can be added later.

---

# 7. Landing Page

The landing page should immediately explain the concept.

## Hero

### Headline

> **See past the marketing.**

### Supporting text

> Paste a product link or upload its packaging. RawLabel breaks down the claims, ingredients, specifications and important details — then shows you what the product looks like without the marketing fluff.

Primary interface:

```text
Paste product URL

[ https://...                         ]

             [ Analyze ]
```

and:

```text
or

[ Upload Product Image ]
```

---

# 8. Example Demonstration

The homepage should contain a sample transformation.

### Before

Show an example of a marketing-heavy product presentation.

### After

Show:

> **RAW LABEL**

with a minimal monochrome representation.

Example:

```text
MARKETING VERSION

"ULTIMATE
HIGH-PROTEIN
FITNESS
SUPER SNACK"

          ↓

RAW LABEL

┌──────────────────────┐
│                      │
│     PROTEIN BAR      │
│                      │
│     20g PROTEIN      │
│     250 kcal         │
│     8g SUGAR         │
│     10g FAT          │
│                      │
│        60g           │
└──────────────────────┘
```

The actual generated visual should be significantly more polished than this ASCII example.

---

# 9. Product URL Analysis

When the user provides a URL:

```text
Browser
   ↓
Backend
   ↓
URL validation
   ↓
Secure webpage retrieval
   ↓
HTML extraction
   ↓
Structured data extraction
   ↓
Product information
   ↓
AI analysis
```

The browser must not directly scrape arbitrary websites.

---

# 10. URL Security

User-provided URLs are untrusted.

The backend must protect against SSRF and malicious requests.

Implement:

* HTTP/HTTPS only
* Localhost blocking
* Private IP blocking
* Loopback blocking
* Link-local blocking
* Internal hostname protection
* Redirect validation
* Redirect limits
* Request timeout
* Response-size limit
* Safe DNS handling where appropriate

Every redirect must be treated as untrusted and validated.

---

# 11. Product Image Analysis

When the user uploads an image:

```text
Image
  ↓
Image validation
  ↓
Vision/OCR
  ↓
Text extraction
  ↓
Product information extraction
  ↓
Marketing claim extraction
  ↓
Evidence analysis
```

The system should detect information such as:

* Product name
* Brand
* Ingredients
* Nutrition
* Quantity
* Serving size
* Claims
* Certifications
* Warnings
* Product specifications

---

# 12. Multiple Images

Support multiple product images where useful.

For example:

```text
Front
Back
Ingredients
Nutrition
Side
```

The system should combine the information into a single analysis.

Example:

```text
Image 1 → Front packaging
Image 2 → Nutrition label
Image 3 → Ingredients
        ↓
    Combined Product Dataset
```

Duplicate information should be deduplicated.

Conflicting information should be surfaced rather than silently resolved.

---

# 13. Product Data Model

Internally represent the product using structured data.

Example:

```json
{
  "source": {
    "type": "url | image | multiple_images",
    "url": "",
    "retrieved_at": ""
  },

  "product": {
    "name": "",
    "brand": "",
    "category": "",
    "variant": "",
    "description": "",
    "quantity": ""
  },

  "pricing": {
    "currency": "",
    "price": null,
    "mrp": null,
    "discount": null
  },

  "ingredients": [],

  "nutrition": {
    "serving_size": "",
    "calories": null,
    "protein": null,
    "carbohydrates": null,
    "sugar": null,
    "fat": null,
    "saturated_fat": null,
    "fiber": null,
    "sodium": null
  },

  "marketing_claims": [],

  "certifications": [],

  "warnings": [],

  "specifications": [],

  "evidence": [],

  "unknown_information": []
}
```

The exact schema can evolve.

---

# 14. Evidence Is Critical

Every important fact should ideally have a source.

For example:

```json
{
  "fact": "20g protein",
  "source": "nutrition_table",
  "source_text": "Protein 20g per serving"
}
```

For a marketing claim:

```json
{
  "claim": "High Protein",
  "source": "front_of_pack",
  "source_text": "HIGH PROTEIN"
}
```

The analysis should be based on evidence rather than unsupported AI reasoning.

---

# 15. Marketing Claim Detection

Detect marketing claims dynamically.

Examples include:

* High Protein
* Low Sugar
* Sugar Free
* No Added Sugar
* Natural
* Organic
* Healthy
* Premium
* Made with Real Fruit
* Made with Real Ingredients
* Immunity Boosting
* Clinically Tested
* Doctor Recommended
* Dermatologist Tested
* No Preservatives
* 100% Natural
* Zero Calories
* Sustainable
* Eco Friendly
* Clean
* Wholesome
* Guilt Free

This is an illustrative list, not a fixed list.

The AI should identify relevant claims that are not explicitly included here.

---

# 16. Claim Classification

Each marketing claim should receive one of four statuses:

```text
SUPPORTED
NOT_SUPPORTED
UNCLEAR
SUBJECTIVE
```

### SUPPORTED

The available evidence supports the claim.

### NOT_SUPPORTED

The available evidence conflicts with the claim.

### UNCLEAR

There is insufficient information.

### SUBJECTIVE

The claim is subjective or does not have a sufficiently objective definition.

---

# 17. Example Claim Analysis

```json
{
  "claim": "High Protein",
  "status": "SUPPORTED",
  "evidence": [
    "20g protein per 60g serving"
  ],
  "explanation": "The product lists 20g of protein per serving."
}
```

Another:

```json
{
  "claim": "Natural",
  "status": "UNCLEAR",
  "evidence": [
    "The product page describes the product as natural."
  ],
  "explanation": "The available information does not provide a sufficiently clear basis to independently verify this claim."
}
```

---

# 18. Never Invent Information

The AI must never invent:

* Ingredients
* Nutrition values
* Certifications
* Product specifications
* Medical benefits
* Scientific studies
* Manufacturing processes
* Product claims

If information is unavailable:

> **Unknown**

is the correct result.

---

# 19. Separate Facts From Claims

RawLabel must distinguish:

### FACT

> Protein: 20g per serving.

### MARKETING CLAIM

> "High Protein."

### CALCULATION

> Protein contributes approximately X% of listed calories.

### INTERPRETATION

> Protein is one of the product's primary marketing messages.

### UNKNOWN

> The available information does not establish this.

This distinction should be visible in the UI where appropriate.

---

# 20. Raw Label

The central analysis should contain:

# RAW LABEL

## Product

**XYZ Protein Bar**

### What you're actually getting

* 20g protein
* 250 kcal
* 8g sugar
* 10g fat
* 5g fiber
* 60g serving

### Main ingredients

1. Ingredient A
2. Ingredient B
3. Ingredient C

### Marketing claims

| Claim        | Status     |
| ------------ | ---------- |
| High Protein | Supported  |
| Natural      | Unclear    |
| Healthy      | Subjective |

### Things worth noticing

* The product prominently emphasizes protein.
* The serving size is 60g.
* The product contains X ingredients.
* One marketing claim cannot be independently verified.

### What we could not verify

* X
* Y

---

# 21. The AI-Generated Neutral Product Visual

This is a major feature.

After the analysis, generate a visual representation of the product.

The visual should resemble a:

> **Plain, stripped-down, information-first product package.**

Visual characteristics:

* Black and white or near-monochrome
* Minimal typography
* Simple packaging shape
* No advertising slogans
* No exaggerated imagery
* No promotional badges
* No fake certifications
* No fake claims
* No unnecessary brand marketing
* Clear product identity
* Important verified facts displayed transparently

The visual may contain information such as:

```text
PRODUCT NAME

60g

20g PROTEIN
250 kcal
8g SUGAR
```

depending on what information is actually available.

---

# 22. Generated Visual Philosophy

The generated image should answer:

> **"What would this product presentation look like if it were designed primarily to communicate the facts rather than persuade me?"**

It should NOT answer:

> "What would the product look like if the company were exposed as dishonest?"

That distinction is important.

RawLabel should not manufacture accusations visually.

---

# 23. Generated Visual Prompt

The application should generate the visual from structured verified information.

The image-generation prompt should be built dynamically.

Conceptually:

```text
Create a minimalist monochrome product package representation.

Use only the verified product information supplied below.

Remove promotional language, exaggerated marketing claims,
persuasive imagery, badges, slogans and decorative advertising.

Present the product as a neutral information-first package.

Do not invent ingredients, nutrition values, certifications,
health benefits or product specifications.

If a fact is unknown, do not invent it.

The visual should feel like a clean technical/raw product label,
not an advertisement.

Verified product information:
...
```

The actual prompt should be refined during implementation.

---

# 24. Generated Image Safety Against Hallucination

The application should NOT allow the image generator to freely invent product details.

The backend should provide structured information.

For example:

```json
{
  "product_name": "XYZ Protein Bar",
  "quantity": "60g",
  "protein": "20g",
  "calories": "250 kcal",
  "sugar": "8g"
}
```

The generated visual should only use these verified fields.

---

# 25. Important Technical Consideration

AI image generation is not perfectly reliable for rendering exact text.

Therefore:

### Preferred architecture

Generate the **neutral product/package artwork** using image generation, but render critical factual text using normal HTML/SVG/CSS on top of or alongside the generated visual.

For example:

```text
             AI GENERATED
             PACKAGE ART
                  +
          VERIFIED HTML/SVG
             INFORMATION
```

This ensures that:

* Nutrition values are accurate.
* Product names are accurate.
* Numbers are not distorted.
* Unknown information is not invented.
* Text remains selectable/accessibility-friendly.

The exact implementation can be decided by the coding agent.

---

# 26. Before / After Presentation

The result page should prominently show the transformation.

For example:

```text
             ORIGINAL

        [Product page/image]

                  ↓

          MARKETING REMOVED

                  ↓

           RAW LABEL VIEW

        [AI neutral visual]
```

On desktop, this could appear side-by-side.

On mobile, stack them vertically.

---

# 27. Marketing → Reality

Another key UI component:

```text
MARKETING

"High Protein"

       ↓

EVIDENCE

20g protein / 60g serving

       ↓

RAW LABEL

20g protein per serving
```

For unsupported/unclear claims:

```text
MARKETING

"Natural"

       ↓

EVIDENCE

No clear definition available

       ↓

RAW LABEL

Claim cannot be independently verified
from the available information.
```

---

# 28. Things Worth Noticing

The AI should identify meaningful observations.

Examples:

* The product prominently emphasizes protein.
* The serving size is relatively small.
* A large marketing claim lacks supporting information.
* The product contains several sweeteners.
* The product page emphasizes one nutritional characteristic while providing less prominent information about another.
* A price discount is based on the listed MRP.

Only generate observations supported by evidence.

---

# 29. Neutral Language

RawLabel should not make unsupported accusations.

Avoid:

> "This company is lying."

Prefer:

> "This claim could not be verified from the available information."

Avoid:

> "This is an unhealthy product."

Prefer:

> "The product contains 8g of sugar and 250 kcal per listed serving."

Avoid:

> "This is a scam."

Prefer:

> "The advertised claim does not appear to be supported by the information available on the product page."

The goal is to make the user more informed, not to make the website sensational.

---

# 30. AI Architecture

The application should use AI for:

* Product understanding
* Claim extraction
* Evidence analysis
* Plain-language explanation
* Neutral visual generation

AI API calls must happen server-side.

Never expose API credentials in frontend code.

Architecture:

```text
                    Browser
                       |
                URL / Image
                       |
                       ↓
                   Backend
                       |
          ┌────────────┴────────────┐
          |                         |
     URL Retrieval              Image Processing
          |                         |
          └────────────┬────────────┘
                       ↓
              Structured Product Data
                       ↓
                AI Text Analysis
                       ↓
                 Schema Validation
                       ↓
                 Raw Label Data
                       ↓
               Image Generation
                       ↓
                    Frontend
```

---

# 31. AI Text Analysis

Use a structured-output model.

The model should return:

```json
{
  "product_summary": {},
  "facts": [],
  "ingredients": [],
  "nutrition": {},
  "marketing_claims": [],
  "observations": [],
  "unknown_information": [],
  "raw_label_summary": ""
}
```

Validate the response server-side.

Never blindly trust AI-generated JSON.

---

# 32. AI Prompt Rules

The analysis prompt should instruct the AI:

```text
You are an evidence-focused product analysis assistant.

Analyze only the information provided.

Separate facts from marketing claims.

Never invent missing information.

Do not treat a marketing statement as proof that it is true.

Do not automatically assume a claim is false.

Use:
SUPPORTED
NOT_SUPPORTED
UNCLEAR
SUBJECTIVE

when evaluating claims.

Every important conclusion should be supported by available evidence.

Use neutral, plain language.

If information is unavailable, explicitly mark it as unknown.

Do not make unsupported medical, legal, financial or safety claims.

Return structured output only.
```

---

# 33. URL Retrieval Architecture

For URL input:

```text
User URL
   ↓
Validate
   ↓
Secure Fetch
   ↓
Parse HTML
   ↓
Extract JSON-LD
   ↓
Extract metadata
   ↓
Extract visible content
   ↓
Build Product Dataset
```

If the website requires JavaScript:

```text
Normal Fetch
     ↓
Insufficient content
     ↓
Optional Headless Browser
     ↓
Rendered Page
     ↓
Extraction
```

Use a headless browser only when necessary.

---

# 34. Image Analysis Architecture

For image input:

```text
Uploaded Image
      ↓
File validation
      ↓
Image preprocessing
      ↓
Vision/OCR
      ↓
Structured extraction
      ↓
Product Dataset
```

Support multiple images.

---

# 35. URL Failure

Some websites will:

* Block bots
* Require login
* Use CAPTCHAs
* Render content dynamically
* Restrict automated access

Do not attempt to bypass authentication or security systems.

Instead show:

> **We couldn't read this product page automatically.**

Then offer:

> **Upload a screenshot instead**

This turns image input into a valuable fallback.

---

# 36. Image Failure

If the image is:

* Too blurry
* Too dark
* Too small
* Not a product
* Missing important information

show:

> We couldn't extract enough information from this image.

Offer:

> Upload another image

or:

> Add another image of the back/nutrition/ingredients section.

---

# 37. Multiple Evidence Sources

The system should be capable of combining:

```text
Product URL
     +
Front image
     +
Back image
     +
Nutrition image
```

into one product analysis.

If sources disagree:

> **Information conflict detected**

Then show both values and their sources.

Do not silently choose one.

---

# 38. Source Transparency

The result should show where information came from.

Example:

```text
Protein: 20g
Source: Product nutrition information

"High Protein"
Source: Product marketing copy
```

For URL analysis, display:

> Source: example.com/product/xyz

For image analysis:

> Source: Uploaded product image

---

# 39. Price and Value Analysis

If price and quantity are available:

Display:

* Current price
* MRP
* Discount
* Quantity
* Price per 100g
* Price per serving

Future calculations may include:

* Protein per ₹
* Calories per ₹
* Value comparisons

Only calculate values when the underlying units are reliable.

---

# 40. Privacy

Minimize data collection.

Clearly explain:

* What URLs are processed.
* Whether URLs are stored.
* Whether uploaded images are stored.
* How long data is retained.
* Whether third-party AI providers receive data.
* Whether information is used for training.

If images are temporarily processed and deleted, state this clearly.

---

# 41. Security

The production application must:

* Keep API keys server-side.
* Validate URLs.
* Prevent SSRF.
* Validate uploaded files.
* Limit image size.
* Limit webpage size.
* Set network timeouts.
* Validate redirects.
* Rate-limit expensive endpoints.
* Validate AI output.
* Sanitize webpage content.
* Never execute arbitrary scraped HTML in the frontend.
* Use HTTPS.

---

# 42. Frontend Components

A reasonable component structure:

```text
LandingPage
│
├── Navbar
├── Hero
│   ├── UrlInput
│   └── ImageUpload
│
├── HowItWorks
├── ExampleTransformation
└── Footer
```

Analysis page:

```text
AnalysisPage
│
├── OriginalProduct
├── RawLabelVisual
├── RawLabelSummary
├── KeyFacts
├── NutritionTable
├── Ingredients
├── MarketingClaims
├── MarketingReality
├── ThingsToNotice
├── UnknownInformation
├── Evidence
└── Disclaimer
```

---

# 43. Visual Design

The website should feel:

* Clean
* Modern
* Trustworthy
* Minimal
* Consumer-focused
* Slightly editorial

The generated RawLabel visual should contrast with colorful marketing.

Recommended visual language:

### Website

Clean modern UI.

### Original product

Show as supplied.

### RawLabel

Black/white or monochrome.

This visual contrast communicates the concept immediately.

---

# 44. RawLabel Visual Design

The generated visual should resemble:

* Technical packaging
* Laboratory label
* Plain retail packaging
* Product information sheet
* Minimal industrial design

Avoid:

* Aggressive red warning graphics
* "EXPOSED" stamps
* Fake government warnings
* Fake regulatory labels
* Fake nutrition labels
* Sensational "SCAM" graphics

RawLabel is about **removing persuasion**, not replacing it with negative persuasion.

---

# 45. Responsive Design

The application must work on:

* Desktop
* Tablet
* Mobile

Mobile is especially important because users may scan products while shopping.

The input experience should make it easy to:

* Paste a URL
* Upload a photo
* Take a photo from a mobile device

---

# 46. Accessibility

Implement:

* Semantic HTML
* Keyboard navigation
* Accessible buttons
* Alt text
* Screen-reader support
* Visible focus states
* Good contrast
* Status indicators that don't rely solely on color

For example:

```text
✓ Supported
? Unclear
! Not supported
```

instead of only green/yellow/red.

---

# 47. Loading Experience

Show meaningful analysis stages:

```text
Analyzing product...

✓ Reading product information
✓ Extracting ingredients
✓ Extracting nutrition
✓ Identifying marketing claims
● Comparing claims with evidence
○ Creating Raw Label
○ Creating neutral product visual
```

Do not show fake percentages.

---

# 48. Error Handling

Handle:

* Invalid URL
* Website unavailable
* Website blocked
* Product not detected
* Image unreadable
* Missing information
* AI timeout
* AI API failure
* Image generation failure
* Invalid AI output

If image generation fails, the **textual Raw Label must still work**.

The generated image is an enhancement, not a dependency for the core product.

---

# 49. Database

Persistence is optional for the first development version.

If implemented:

```text
Analysis
---------
id
source_type
source_url
created_at
product_name
brand
category
analysis_status
structured_analysis
generated_visual_reference
```

Do not store unnecessary personal information.

---

# 50. Caching

Future caching can reduce:

* Webpage retrieval
* AI costs
* Processing time

Cache product information for a reasonable period.

Always display an appropriate retrieval/analysis timestamp.

Product information can change.

---

# 51. Rate Limiting

Protect expensive operations.

At minimum:

* Rate limit analysis requests.
* Limit image size.
* Limit number of images.
* Limit webpage response size.
* Limit request duration.
* Limit AI tokens.
* Limit image-generation requests.

---

# 52. Testing

Create tests for:

## Frontend

* URL input
* Image upload
* Loading state
* Error state
* Analysis rendering
* Raw Label rendering
* Mobile layout

## Backend

* URL validation
* SSRF protection
* Web retrieval
* HTML extraction
* Image validation
* AI schema validation
* Rate limiting

## AI

Create a fixed evaluation dataset.

Test:

* Product extraction
* Claim detection
* Claim classification
* Evidence association
* Hallucination rate
* Unknown information handling

## Image Generation

Verify:

* Generated image does not introduce unsupported claims.
* Critical facts come from structured data.
* Generated visual remains neutral.
* Image generation failure does not break the analysis.

---

# 53. Evaluation Dataset

Create 20–50 real products for evaluation.

Include:

* Protein bars
* Cereals
* Soft drinks
* Juices
* Snacks
* Dairy products
* Packaged foods
* Other common consumer products

For each product manually establish:

* Product name
* Ingredients
* Nutrition
* Important claims
* Price
* Quantity

Use this dataset to evaluate the system.

---

# 54. Key Evaluation Metrics

## Extraction accuracy

Can RawLabel correctly identify:

* Product name
* Brand
* Ingredients
* Nutrition
* Price
* Quantity?

## Claim detection

Does it identify important marketing claims?

## Claim classification

Does it correctly determine:

* Supported
* Not supported
* Unclear
* Subjective?

## Hallucination rate

Does the AI invent facts?

## Evidence traceability

Can important conclusions be traced to source material?

## Visual accuracy

Does the neutral product visual contain only verified information?

Accuracy is more important than making the analysis look impressive.

---

# 55. Development Phases

## Phase 1 — Project Setup

* Initialize repository.
* Configure frontend.
* Configure backend.
* Configure TypeScript.
* Configure environment variables.
* Configure linting.
* Configure formatting.
* Create README.
* Add basic tests.

Acceptance:

```text
Frontend runs.
Backend runs.
Environment variables work.
```

---

# Phase 2 — Landing Page

Build:

* Hero
* URL input
* Image upload
* Analyze button
* How It Works
* Example transformation
* Footer

Acceptance:

A visitor understands the product immediately.

---

# Phase 3 — URL Retrieval

Implement:

* URL validation
* Secure fetching
* SSRF protection
* Redirect validation
* Timeouts
* Response-size limits

Acceptance:

A normal public product URL can be safely retrieved.

---

# Phase 4 — Image Input

Implement:

* Upload
* File validation
* Image preview
* Multiple images
* Image size limits

Acceptance:

A user can submit one or more product images.

---

# Phase 5 — Product Extraction

Implement:

* Product information extraction
* JSON-LD extraction
* Metadata extraction
* HTML extraction
* Vision/OCR extraction

Acceptance:

Both URLs and images produce a common structured product dataset.

---

# Phase 6 — AI Analysis

Implement:

* Structured AI prompt
* Product analysis
* Marketing claim extraction
* Claim classification
* Evidence mapping
* Observations
* Unknown information

Acceptance:

A real product produces a valid structured Raw Label.

---

# Phase 7 — Raw Label UI

Implement:

* Product summary
* Nutrition
* Ingredients
* Claims
* Marketing → Reality
* Things Worth Noticing
* Unknown information
* Evidence

Acceptance:

The result is understandable without technical knowledge.

---

# Phase 8 — Neutral Product Visual

Implement:

1. Build verified structured product data.
2. Generate neutral product artwork.
3. Overlay critical factual information using HTML/SVG where appropriate.
4. Display original and RawLabel visual together.
5. Handle image-generation failure gracefully.

Acceptance:

A user can visually understand the difference between the marketed product and the neutral representation.

---

# Phase 9 — Error Handling

Test:

* Invalid URL
* Blocked URL
* Broken URL
* Dynamic website
* Missing data
* Bad image
* Non-product image
* AI failure
* Image generation failure

Acceptance:

No failure crashes the application.

---

# Phase 10 — Security

Perform a full security pass.

Verify:

* SSRF
* URL validation
* Redirect validation
* Upload validation
* API key protection
* Rate limiting
* AI output validation
* HTML sanitization
* Logging

---

# Phase 11 — Evaluation

Run the evaluation dataset.

Measure:

* Extraction accuracy
* Claim accuracy
* Hallucination rate
* Evidence traceability
* Visual accuracy

Fix the most common failure modes.

---

# Phase 12 — Production Deployment

Configure:

* Production environment
* Domain
* HTTPS
* AI provider
* Image generation provider
* Monitoring
* Error tracking
* Rate limiting

Deploy.

---

# 56. Definition of Done

The MVP is complete when:

* [ ] User can paste a product URL.
* [ ] User can upload a product image.
* [ ] Multiple images are supported.
* [ ] URLs are securely processed.
* [ ] Product pages can be parsed.
* [ ] Product images can be analyzed.
* [ ] Product information is extracted.
* [ ] Marketing claims are detected.
* [ ] Claims are classified.
* [ ] Evidence is associated with claims.
* [ ] Unknown information is explicitly identified.
* [ ] Raw Label is generated.
* [ ] Marketing → Reality section works.
* [ ] Things Worth Noticing section works.
* [ ] Neutral AI-generated product visual works.
* [ ] Critical visual facts are not dependent on AI-generated text accuracy.
* [ ] Image generation failure does not break the analysis.
* [ ] Loading states work.
* [ ] Error states work.
* [ ] API keys remain server-side.
* [ ] SSRF protection exists.
* [ ] Rate limiting exists.
* [ ] AI output is schema validated.
* [ ] Automated tests exist.
* [ ] Real products have been evaluated.
* [ ] Mobile UI works.
* [ ] Privacy information exists.
* [ ] Terms/disclaimer exists.
* [ ] Website is deployed.

---

# 57. Future Features

These should not block the MVP.

## Product Comparison

Compare multiple products.

## Barcode Scanner

Scan a product barcode.

## Browser Extension

Analyze products while shopping.

## Mobile App

Camera → RawLabel.

## Product History

Track changes in:

* Price
* Ingredients
* Nutrition
* Marketing claims

## Ingredient Explainer

Click an ingredient and see:

> What is this?

## Personalized Analysis

Users could optionally define preferences such as:

* High protein
* Low sugar
* Vegetarian
* Vegan
* Allergies
* Budget

The system should then explain how the product compares with those preferences without pretending to provide medical advice.

---

# 58. Future Product Categories

Start with food and beverages.

Eventually support:

```text
Food
↓
Beverages
↓
Cosmetics
↓
Supplements
↓
Cleaning Products
↓
Electronics
↓
Appliances
↓
Automotive
↓
Other Consumer Products
```

Each category can have specialized extraction and analysis rules.

---

# 59. Long-Term Vision

RawLabel should become a universal **marketing translator**.

```text
ANY PRODUCT
     ↓
PRODUCT PAGE / PHOTO
     ↓
FACT EXTRACTION
     ↓
MARKETING CLAIMS
     ↓
EVIDENCE
     ↓
AI ANALYSIS
     ↓
RAW LABEL
     ↓
NEUTRAL PRODUCT VISUAL
     ↓
PLAIN ENGLISH
```

The long-term product promise is:

> **Show me what I'm actually buying — without the marketing.**

---

# 60. Development Instructions for Codex / Claude

When implementing this project:

1. Read `goal.md` completely before writing code.
2. Treat this file as the product source of truth.
3. Inspect the existing repository before making architectural decisions.
4. Implement the project incrementally.
5. Start with Phase 1.
6. Do not implement future features prematurely.
7. Keep the architecture simple.
8. Do not introduce unnecessary dependencies.
9. Keep all secrets server-side.
10. Treat user URLs as untrusted input.
11. Treat scraped webpages as untrusted input.
12. Treat uploaded images as untrusted input.
13. Treat AI output as untrusted until validated.
14. Never invent product facts.
15. Preserve uncertainty.
16. Prefer evidence-backed explanations.
17. Keep the interface neutral rather than sensational.
18. Test important functionality as it is implemented.
19. Run linting and tests after major changes.
20. Fix existing errors before moving to the next phase.
21. Update the README as implementation progresses.
22. Make sensible technical decisions where this specification intentionally leaves implementation details open.

---

# 61. Most Important Product Principle

RawLabel should not simply replace positive marketing with negative marketing.

It should replace **persuasion with information**.

The product should never communicate:

> "The company wants to fool you."

unless this is independently established by reliable evidence.

Instead, it should communicate:

> "Here is what they emphasize."

> "Here is what the available evidence says."

> "Here is what we can verify."

> "Here is what we cannot verify."

> "Here is what is worth noticing."

And finally:

> **Here is what the product looks like when the marketing is stripped away.**

That is the core identity of RawLabel.

# Product Truth Hierarchy

When analyzing a product, RawLabel must prioritize information according to the following hierarchy:

1. **Actual product ingredients/nutrition label**
2. **Product packaging images supplied by the user**
3. **Official manufacturer product information**
4. **Official product webpage**
5. **Marketing copy and promotional descriptions**
6. **Third-party information**

The **actual ingredients label printed on the product/package is the primary source of truth** for determining what the product contains.

If information from marketing copy conflicts with the ingredients or nutrition label, the label must take precedence.

For example:

Marketing copy:
> "Made with real fruit"

Ingredients:
> Sugar, water, fruit flavoring, 1% fruit juice concentrate

RawLabel should base its analysis on the ingredient list and explicitly point out the difference between the marketing claim and the ingredient information.

### Important distinction

The ingredients label is the source of truth for **what the product contains**, but it is not automatically the source of truth for every possible question.

For example:

- Ingredients → packaging ingredient list
- Nutrition → official nutrition facts panel
- Quantity → packaging/product specification
- Price → current verified price
- Marketing claim → marketing material
- Certification → verifiable certification information

RawLabel must not replace one type of evidence with another simply because it appears higher in the hierarchy.

### Conflict handling

If two sources provide conflicting information:

1. Prefer the actual product label for composition-related information.
2. Preserve the conflicting information.
3. Show the conflict to the user when it is meaningful.
4. Never silently choose a value and discard contradictory evidence.

Example:

> **Product page:** 25g protein  
> **Nutrition label:** 20g protein

RawLabel should use **20g protein** for the product's actual nutrition analysis and indicate that the webpage contains a conflicting value.

### AI instruction

The AI analysis must follow this rule:

> **For composition-related information, treat the actual ingredient and nutrition label on the product packaging as the authoritative source. Marketing copy must never override the product label.**

If the label is unavailable, the system should explicitly state that the information could not be verified from the primary source rather than inventing or confidently assuming the value.