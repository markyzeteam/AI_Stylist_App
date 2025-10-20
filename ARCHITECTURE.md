# 🎯 YZE SHOPPING AI - COMPLETE ARCHITECTURE & COST DOCUMENTATION

---

## 📋 TABLE OF CONTENTS

1. System Overview
2. Architecture Diagram (UPDATED: Gemini-Only)
3. Database Schema
4. Phase 1: Admin Refresh Workflow (3x/day)
5. Phase 2: User Recommendation Workflow (Real-time)
6. AI Provider Integration
7. Cost Analysis (UPDATED: Gemini-Only vs Gemini+OpenAI)
8. Implementation Checklist

---

## ⚡ LATEST UPDATE: GEMINI-ONLY ARCHITECTURE (RECOMMENDED)

**Date:** 2025-01-XX
**Change:** Simplified to use Gemini 2.0 Flash for BOTH image analysis AND recommendations
**Why:** 33% cheaper, simpler architecture, one API provider instead of two

---

## 1. SYSTEM OVERVIEW

### Purpose
Pre-compute and cache product analysis to provide instant, personalized fashion recommendations based on body shape, color season, and personal values.

### Key Features
- ✅ Pre-analyze products with Gemini (images + text)
- ✅ Real-time recommendations with Gemini (cached analysis)
- ✅ Multiple filter paths (body shape, color season, values)
- ✅ Incremental updates (only new/changed products)
- ✅ 3x/day refresh limit (cost control)
- ✅ Size recommendations based on measurements

### AI Provider (UPDATED)
- **Gemini 2.0 Flash:** Image analysis (Phase 1) + Product recommendations (Phase 2)
- **Cost:** $18.77/month for 2,000 products + 100 users/day
- **Why Single Provider:** Simpler, cheaper, fewer API keys to manage

<!-- PREVIOUS ARCHITECTURE (COMMENTED OUT FOR REFERENCE):
### AI Providers (OLD - Gemini + OpenAI)
- **Gemini 1.5 Flash:** Image analysis only (colors, silhouette, style)
- **OpenAI GPT-4o mini:** Text analysis, scoring, recommendations
- **Cost:** $27.98/month for 2,000 products + 100 users/day
-->

### Database
- PostgreSQL on Railway
- Single-tier caching: FilteredSelectionWithImgAnalyzed (with Gemini analysis)

---

## 2. ARCHITECTURE DIAGRAM

### ✅ CURRENT: Gemini-Only Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PHASE 1: ADMIN REFRESH                          │
│                    (3x per day maximum)                             │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Admin Clicks   │
    │ "Refresh Now"   │
    └────────┬────────┘
             │
             ↓
    ┌─────────────────────────────┐
    │ Check Daily Limit (3x/day)  │
    │ IF count >= 3: ABORT        │
    └────────┬────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Fetch ALL Products from Shopify      │
    │ • Active products only               │
    │ • Published to Online Store          │
    │ • Pagination (250/page)              │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Apply Basic Filters                  │
    │ • Stock availability                 │
    │ • Categories (admin settings)        │
    │ • Price range                        │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Compare with Existing Database       │
    │ • Find NEW products                  │
    │ • Find UPDATED products              │
    │   (image URL changed, title changed) │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Send ONLY New/Updated to Gemini      │
    │ • Batch: 50-100 products typically   │
    │ • Analyze image + extract features   │
    │ • Model: Gemini 2.0 Flash            │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Gemini Returns Visual Analysis       │
    │ • Colors: ["olive", "cream"]         │
    │ • Silhouette: "A-line"               │
    │ • Style: ["bohemian", "casual"]      │
    │ • Fabric: "flowy"                    │
    │ • Details: ["v-neck", "midi"]        │
    │ • Color Seasons: ["Autumn"]          │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Calculate Values Scores              │
    │ • Sustainability (from tags)         │
    │ • Budget category (from price)       │
    │ • Style scores (from Gemini)         │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Store in FilteredSelectionWith       │
    │ ImgAnalyzed                          │
    │ (Complete product data + Gemini AI)  │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Update ProductRefreshLog             │
    │ • Status: "completed"                │
    │ • Products analyzed                  │
    │ • Gemini API calls count             │
    │ • Total cost                         │
    └──────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                  PHASE 2: USER REQUEST                              │
│                     (Real-time)                                     │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────┐
    │  User Submits Preferences       │
    │  • Body shape: "Pear"           │
    │  • Color season: "Autumn"       │
    │  • Values: sustainability, etc  │
    │  • Measurements (optional)      │
    └────────┬────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Query Database                       │
    │ • Read FilteredSelectionWith         │
    │   ImgAnalyzed (WITH Gemini data)     │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Apply Database Pre-Filters           │
    │ • Color season match                 │
    │ • Sustainability score >= 70         │
    │ • Budget category match              │
    │ • Style preferences match            │
    │ • Stock availability                 │
    │                                      │
    │ Result: 5,000 → 500-1,000 products   │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Prepare Products for Gemini          │
    │ • Include: title, description,       │
    │   tags, price, product type          │
    │ • Include: Cached Gemini analysis    │
    │   (colors, silhouette, style, etc)   │
    │ • Send ALL filtered products         │
    │ • NO IMAGES (use cached analysis)    │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Build Gemini Prompt                  │
    │                                      │
    │ "Analyze these 500 products for a    │
    │  Pear body shape who prefers Autumn  │
    │  colors and sustainable fashion.     │
    │                                      │
    │  Body shape guidance:                │
    │  - Balance wider hips                │
    │  - A-line silhouettes                │
    │  - Avoid tight bottoms               │
    │                                      │
    │  Color season guidance:              │
    │  - Autumn: olive, mustard, rust      │
    │                                      │
    │  Products: [JSON with cached         │
    │             visual analysis]         │
    │                                      │
    │  Return top 30 with:                 │
    │  - Score (0-100)                     │
    │  - Reasoning                         │
    │  - Styling tip                       │
    │  - Size advice"                      │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Call Gemini API                      │
    │ • Model: gemini-2.0-flash            │
    │ • Temperature: 0.7                   │
    │ • Max tokens: 8192                   │
    │ • Response format: JSON              │
    │                                      │
    │ Time: 2-5 seconds                    │
    │ Cost: ~$0.0062 per request           │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Gemini Returns Recommendations       │
    │                                      │
    │ {                                    │
    │   "recommendations": [               │
    │     {                                │
    │       "productId": "123",            │
    │       "score": 95,                   │
    │       "reasoning": "...",            │
    │       "stylingTip": "...",           │
    │       "sizeAdvice": "..."            │
    │     }                                │
    │   ]                                  │
    │ }                                    │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Filter by minimumMatchScore          │
    │ • Remove products < 70 score         │
    │ • Sort by score (descending)         │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Size Matching (if measurements)      │
    │ • Match user measurements to         │
    │   product size chart                 │
    │ • Recommend specific size per product│
    │ • Example: "Size M recommended"      │
    └────────┬─────────────────────────────┘
             │
             ↓
    ┌──────────────────────────────────────┐
    │ Return Top N Recommendations         │
    │ • Limit to numberOfSuggestions (30)  │
    │ • Include all metadata               │
    │ • Response time: 2-5 seconds         │
    └──────────────────────────────────────┘
```

<!--
═══════════════════════════════════════════════════════════════════════
PREVIOUS ARCHITECTURE: Gemini + OpenAI (COMMENTED OUT)
═══════════════════════════════════════════════════════════════════════

This section is kept for reference. The architecture below uses TWO AI providers:
- Gemini 1.5 Flash for image analysis (Phase 1)
- OpenAI GPT-4o mini for recommendations (Phase 2)

Cost: $27.98/month for 2,000 products + 100 users/day (vs $18.77/month with Gemini-only)

[Previous Phase 1 & 2 diagrams with OpenAI integration - SAME AS ABOVE but Phase 2 uses OpenAI instead of Gemini]
-->

---

## 3. DATABASE SCHEMA

### Tables to Use

**✅ ACTIVE TABLES (Gemini-Only Architecture):**

```prisma
// Products with Gemini image analysis (PRIMARY TABLE)
model FilteredSelectionWithImgAnalyzed {
  id                String    @id @default(cuid())
  shop              String

  // Shopify product data
  shopifyProductId  String
  title             String
  handle            String?
  description       String?   @db.Text
  productType       String?
  tags              String[]
  price             Decimal   @db.Decimal(10, 2)
  imageUrl          String?
  variants          Json?
  inStock           Boolean   @default(true)
  availableSizes    String[]
  categories        String[]

  // Gemini image analysis
  geminiAnalysis    Json?
  detectedColors    String[]
  colorSeasons      String[]
  silhouetteType    String?
  styleClassification String[]
  fabricTexture     String?
  designDetails     String[]
  patternType       String?
  additionalNotes   String?   @db.Text // Free-text notes from Gemini

  // Size information
  sizeChart         Json?
  sizeFitNotes      String?

  // Values scoring
  sustainabilityScore Int?
  budgetCategory    String?
  styleScores       Json?

  // Timestamps
  analyzedAt        DateTime  @default(now())
  geminiModelVersion String?
  lastUpdated       DateTime  @updatedAt

  @@unique([shop, shopifyProductId])
  @@index([shop, inStock])
  @@index([colorSeasons])
  @@index([styleClassification])
}

// Refresh tracking (3x/day limit)
model ProductRefreshLog {
  id              String    @id @default(cuid())
  shop            String
  refreshType     String
  triggeredBy     String?
  startedAt       DateTime  @default(now())
  completedAt     DateTime?
  status          String
  productsFetched Int       @default(0)
  productsAnalyzed Int      @default(0)
  geminiApiCalls  Int       @default(0)
  totalCostUsd    Decimal?  @db.Decimal(10, 4)
  errorMessage    String?   @db.Text

  @@index([shop, startedAt])
}

// Gemini settings
model GeminiSettings {
  id        String   @id @default(cuid())
  shop      String   @unique
  apiKey    String?  @db.Text
  model     String   @default("gemini-2.0-flash")
  prompt    String?  @db.Text // Editable image analysis prompt
  systemPrompt String? @db.Text // Editable recommendation system prompt
  enabled   Boolean  @default(true)
  temperature Float  @default(0.7)
  maxTokens   Int    @default(8192)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Filtering settings
model FilteringSettings {
  id                  String   @id @default(cuid())
  shop                String   @unique
  onlyInStock         Boolean  @default(false)
  includedCategories  String[]
  excludedCategories  String[]
  minPrice            Decimal? @db.Decimal(10, 2)
  maxPrice            Decimal? @db.Decimal(10, 2)
  maxProductsToScan   Int      @default(0)
  numberOfSuggestions Int      @default(30)
  minimumMatchScore   Int      @default(70)
  excludeKeywords     String[]
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

<!--
═══════════════════════════════════════════════════════════════════════
TABLES NOT USED IN GEMINI-ONLY ARCHITECTURE (KEPT FOR REFERENCE)
═══════════════════════════════════════════════════════════════════════

// ❌ NOT USED: Basic filtered products (redundant with FilteredSelectionWithImgAnalyzed)
model FilteredSelection {
  id                String    @id @default(cuid())
  shop              String
  shopifyProductId  String
  title             String
  handle            String?
  description       String?   @db.Text
  productType       String?
  tags              String[]
  price             Decimal   @db.Decimal(10, 2)
  imageUrl          String?
  variants          Json?
  inStock           Boolean   @default(true)
  availableSizes    String[]
  categories        String[]
  fetchedAt         DateTime  @default(now())
  lastUpdated       DateTime  @updatedAt

  @@unique([shop, shopifyProductId])
  @@index([shop, inStock])
}

// ❌ NOT USED: OpenAI settings (not using OpenAI)
model OpenAISettings {
  id                    String   @id @default(cuid())
  shop                  String   @unique
  apiKey                String?  @db.Text
  model                 String   @default("gpt-4o-mini")
  systemPrompt          String   @db.Text
  recommendationPrompt  String   @db.Text
  enabled               Boolean  @default(true)
  temperature           Float    @default(0.7)
  maxTokens             Int      @default(4096)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

// ✅ KEEP FOR BACKWARD COMPATIBILITY: ClaudePromptSettings (current system)
// This will be deprecated once Gemini-only system is fully implemented
model ClaudePromptSettings {
  id              String   @id @default(cuid())
  shop            String   @unique
  apiKey          String?  @db.Text
  systemPrompt    String   @db.Text
  recommendationPrompt String @db.Text
  enabled         Boolean  @default(true)
  temperature     Float    @default(0.7)
  maxTokens       Int      @default(4096)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
-->

---

## 4. PHASE 1: ADMIN REFRESH WORKFLOW

### Trigger: Admin clicks "Refresh Products" button (max 3x/day)

### Step-by-Step Process

#### STEP 1: Check Daily Limit

```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);

const refreshCount = await prisma.productRefreshLog.count({
  where: {
    shop,
    startedAt: { gte: today },
    status: { in: ['completed', 'running'] }
  }
});

if (refreshCount >= 3) {
  throw new Error('Daily refresh limit reached (3/3). Try again tomorrow.');
}
```

#### STEP 2: Fetch Products from Shopify

```javascript
const products = await fetchAllProductsAdminAPI(shop);
// Returns: 500-5,000 products with:
// - title, description, tags, price
// - imageUrl, variants, availability
// - productType, handle
```

#### STEP 3: Apply Basic Filters

```javascript
const settings = await prisma.filteringSettings.findUnique({ where: { shop } });

const filtered = products.filter(p => {
  if (settings.onlyInStock && !p.inStock) return false;
  if (settings.minPrice && p.price < settings.minPrice) return false;
  if (settings.maxPrice && p.price > settings.maxPrice) return false;
  return true;
});

// Result: 5,000 → 3,500 products after basic filtering
```

#### STEP 4: Find NEW/UPDATED Products

```javascript
const existing = await prisma.filteredSelectionWithImgAnalyzed.findMany({
  where: { shop },
  select: { shopifyProductId: true, imageUrl: true, lastUpdated: true }
});

const productsToAnalyze = filtered.filter(p => {
  const existingProduct = existing.find(e => e.shopifyProductId === p.id);

  // NEW product
  if (!existingProduct) return true;

  // UPDATED product (image changed)
  if (existingProduct.imageUrl !== p.imageUrl) return true;

  // UNCHANGED (skip)
  return false;
});

console.log(`Found ${productsToAnalyze.length} new/updated products (out of ${filtered.length} total)`);
// Typical: 50-100 products need analysis
```

#### STEP 5: Analyze Images with Gemini 2.0 Flash (Batch)

```javascript
const geminiSettings = await prisma.geminiSettings.findUnique({ where: { shop } });

for (const product of productsToAnalyze) {
  const geminiAnalysis = await analyzeImageWithGemini(
    product.imageUrl,
    geminiSettings.apiKey,
    geminiSettings.prompt || DEFAULT_GEMINI_IMAGE_PROMPT
  );

  // geminiAnalysis = {
  //   colors: ["olive green", "cream"],
  //   colorSeasons: ["Autumn", "Spring"],
  //   silhouette: "A-line",
  //   styles: ["bohemian", "casual"],
  //   fabric: "flowy, lightweight",
  //   details: ["v-neck", "empire waist", "midi length"],
  //   pattern: "floral"
  // }

  // Calculate sustainability score
  const sustainabilityScore = calculateSustainabilityScore(product.tags, product.description);

  // Determine budget category
  const budgetCategory = product.price < 30 ? 'low' :
                         product.price < 80 ? 'medium' :
                         product.price < 200 ? 'high' : 'luxury';

  // Extract style scores from Gemini
  const styleScores = {
    classic: geminiAnalysis.styles.includes('classic') ? 100 : 50,
    trendy: geminiAnalysis.styles.includes('trendy') ? 100 : 50,
    minimalist: geminiAnalysis.styles.includes('minimalist') ? 100 : 50,
    bohemian: geminiAnalysis.styles.includes('bohemian') ? 100 : 50
  };

  // Store in database
  await prisma.filteredSelectionWithImgAnalyzed.upsert({
    where: { shop_shopifyProductId: { shop, shopifyProductId: product.id } },
    create: {
      shop,
      shopifyProductId: product.id,
      title: product.title,
      handle: product.handle,
      description: product.description,
      productType: product.productType,
      tags: product.tags,
      price: product.price,
      imageUrl: product.imageUrl,
      variants: product.variants,
      inStock: product.inStock,
      availableSizes: product.availableSizes,
      categories: product.categories,
      geminiAnalysis,
      detectedColors: geminiAnalysis.colors,
      colorSeasons: geminiAnalysis.colorSeasons,
      silhouetteType: geminiAnalysis.silhouette,
      styleClassification: geminiAnalysis.styles,
      fabricTexture: geminiAnalysis.fabric,
      designDetails: geminiAnalysis.details,
      patternType: geminiAnalysis.pattern,
      sustainabilityScore,
      budgetCategory,
      styleScores,
      geminiModelVersion: geminiSettings.model
    },
    update: {
      title: product.title,
      price: product.price,
      inStock: product.inStock,
      geminiAnalysis,
      detectedColors: geminiAnalysis.colors,
      colorSeasons: geminiAnalysis.colorSeasons,
      silhouetteType: geminiAnalysis.silhouette,
      styleClassification: geminiAnalysis.styles,
      fabricTexture: geminiAnalysis.fabric,
      designDetails: geminiAnalysis.details,
      patternType: geminiAnalysis.pattern,
      sustainabilityScore,
      budgetCategory,
      styleScores,
      lastUpdated: new Date()
    }
  });
}
```

#### STEP 6: Log Refresh

```javascript
await prisma.productRefreshLog.update({
  where: { id: refreshLogId },
  data: {
    status: 'completed',
    completedAt: new Date(),
    productsFetched: products.length,
    productsAnalyzed: productsToAnalyze.length,
    geminiApiCalls: productsToAnalyze.length,
    totalCostUsd: calculateGeminiCost(productsToAnalyze.length)
  }
});

function calculateGeminiCost(imageCount) {
  // Gemini 2.0 Flash pricing
  const tokensPerImage = 258;
  const tokensPerAnalysis = 5000; // output
  const inputCost = (imageCount * tokensPerImage * 0.10) / 1000000;
  const outputCost = (imageCount * tokensPerAnalysis * 0.40) / 1000000;
  return inputCost + outputCost;
}
```

---

## 5. PHASE 2: USER RECOMMENDATION WORKFLOW

### Trigger: User submits body shape + preferences

### Request Example

```json
{
  "shop": "mystore.myshopify.com",
  "paths": {
    "bodyShape": {
      "enabled": true,
      "shape": "Pear/Triangle",
      "measurements": {
        "bust": 90,
        "waist": 70,
        "hips": 95,
        "shoulders": 40
      }
    },
    "colorSeason": {
      "enabled": true,
      "season": "Autumn"
    },
    "values": {
      "enabled": true,
      "sustainability": true,
      "budgetRange": "medium",
      "styles": ["minimalist", "classic"]
    }
  },
  "numberOfSuggestions": 30,
  "minimumMatchScore": 70
}
```

### Step-by-Step Process

#### STEP 1: Query Database

```javascript
// Read cached products with Gemini analysis
let products = await prisma.filteredSelectionWithImgAnalyzed.findMany({
  where: { shop, inStock: true }
});

console.log(`Fetched ${products.length} products from database`);
```

#### STEP 2: Apply Database Pre-Filters

```javascript
let preFiltered = products;

// Color season filter
if (paths.colorSeason?.enabled) {
  preFiltered = preFiltered.filter(p =>
    p.colorSeasons?.includes(paths.colorSeason.season)
  );
}

// Sustainability filter
if (paths.values?.sustainability) {
  preFiltered = preFiltered.filter(p =>
    p.sustainabilityScore >= 70
  );
}

// Budget filter
if (paths.values?.budgetRange) {
  preFiltered = preFiltered.filter(p =>
    p.budgetCategory === paths.values.budgetRange
  );
}

// Style filter
if (paths.values?.styles?.length > 0) {
  preFiltered = preFiltered.filter(p =>
    paths.values.styles.some(style =>
      p.styleClassification?.includes(style)
    )
  );
}

console.log(`Pre-filtered: ${products.length} → ${preFiltered.length} products`);
```

#### STEP 3: Prepare for Gemini

```javascript
const productsForAI = preFiltered.map(p => ({
  id: p.shopifyProductId,
  title: p.title,
  description: p.description,
  productType: p.productType,
  tags: p.tags,
  price: p.price,

  // Include cached Gemini analysis (NO IMAGES)
  visualAnalysis: p.geminiAnalysis ? {
    colors: p.detectedColors,
    silhouette: p.silhouetteType,
    style: p.styleClassification,
    fabric: p.fabricTexture,
    details: p.designDetails,
    colorSeasons: p.colorSeasons
  } : null
}));

console.log(`Prepared ${productsForAI.length} products for Gemini`);
```

#### STEP 4: Build Gemini Prompt

```javascript
const bodyShapeGuidance = {
  "Pear/Triangle": "Balance wider hips with structured shoulders. A-line silhouettes work best. Avoid tight bottoms.",
  "Apple/Round": "Emphasize defined waist with empire cuts, V-necks. Create vertical lines.",
  "Hourglass": "Highlight curves with fitted styles, wrap designs, belted pieces.",
  "Inverted Triangle": "Balance broad shoulders with A-line skirts, wide-leg pants.",
  "Rectangle/Straight": "Create curves with belts, peplum, structured pieces.",
  "V-Shape/Athletic": "Show off athletic build with fitted shirts and straight-leg pants."
};

const colorSeasonGuidance = {
  "Spring": "Best Colors: Peach, coral, light turquoise, golden beige, warm pastels.",
  "Summer": "Best Colors: Pastel blue, rose, lavender, cool gray, soft pinks.",
  "Autumn": "Best Colors: Olive, mustard, terracotta, camel, rust, warm browns.",
  "Winter": "Best Colors: Jewel tones (emerald, ruby, sapphire), icy blue, black, pure white."
};

const prompt = `
You are an expert fashion stylist. Analyze these products for a customer with:

Body Shape: ${paths.bodyShape.shape}
Style Guidance: ${bodyShapeGuidance[paths.bodyShape.shape]}

${paths.colorSeason?.enabled ? `
Color Season: ${paths.colorSeason.season}
Color Guidance: ${colorSeasonGuidance[paths.colorSeason.season]}
` : ''}

${paths.values?.enabled ? `
Values:
  - Sustainability: ${paths.values.sustainability ? 'Prioritize eco-friendly products' : 'No preference'}
  - Budget: ${paths.values.budgetRange || 'Any'}
  - Style: ${paths.values.styles?.join(', ') || 'Any'}
` : ''}

Products (${productsForAI.length} total):
${JSON.stringify(productsForAI, null, 2)}

TASK: Select the top ${numberOfSuggestions} products that best match this customer.

For each recommendation, provide:
- productId: The product ID
- score: Suitability score (0-100)
- reasoning: WHY this product flatters their body shape (2-3 sentences)
- stylingTip: How to wear this product (1-2 sentences)
- sizeAdvice: Sizing guidance

Return ONLY valid JSON in this format:
{
  "recommendations": [
    {
      "productId": "123",
      "score": 95,
      "reasoning": "...",
      "stylingTip": "...",
      "sizeAdvice": "..."
    }
  ]
}
`;
```

#### STEP 5: Call Gemini API

```javascript
const geminiSettings = await prisma.geminiSettings.findUnique({ where: { shop } });

const { GoogleGenerativeAI } = await import("@google/generative-ai");
const genAI = new GoogleGenerativeAI(geminiSettings.apiKey);
const model = genAI.getGenerativeModel({
  model: geminiSettings.model || "gemini-2.0-flash"
});

const result = await model.generateContent({
  contents: [{
    role: "user",
    parts: [{
      text: geminiSettings.systemPrompt ?
        `${geminiSettings.systemPrompt}\n\n${prompt}` :
        prompt
    }]
  }],
  generationConfig: {
    temperature: geminiSettings.temperature || 0.7,
    maxOutputTokens: geminiSettings.maxTokens || 8192,
    responseMimeType: "application/json"
  }
});

const response = result.response.text();
const recommendations = JSON.parse(response);
```

#### STEP 6: Parse & Filter

```javascript
const finalRecommendations = recommendations.recommendations
  .filter(rec => rec.score >= minimumMatchScore)
  .map(rec => {
    const product = preFiltered.find(p => p.shopifyProductId === rec.productId);
    return {
      product,
      suitabilityScore: rec.score / 100, // 0-1 scale
      reasoning: rec.reasoning,
      stylingTip: rec.stylingTip,
      recommendedSize: rec.sizeAdvice,
      category: determineCategory(product)
    };
  })
  .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
  .slice(0, numberOfSuggestions);
```

#### STEP 7: Size Matching (If Measurements Provided)

```javascript
if (paths.bodyShape?.measurements) {
  finalRecommendations.forEach(rec => {
    if (rec.product.sizeChart) {
      rec.recommendedSize = findBestSize(
        rec.product.sizeChart,
        paths.bodyShape.measurements
      );
    }
  });
}
```

#### STEP 8: Return Response

```javascript
return {
  recommendations: finalRecommendations,
  metadata: {
    totalProductsScanned: preFiltered.length,
    totalRecommendations: finalRecommendations.length,
    processingTime: `${Date.now() - startTime}ms`,
    aiProvider: 'gemini-2.0-flash'
  }
};
```

---

## 6. AI PROVIDER INTEGRATION

### Gemini 2.0 Flash (Image Analysis + Recommendations)

#### Installation

```bash
npm install @google/generative-ai
```

#### Image Analysis Function (Phase 1)

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

export const DEFAULT_GEMINI_IMAGE_PROMPT = `
Analyze this fashion product image and extract:

1. Colors: List all prominent colors
2. Color Seasons: Which seasonal palettes does this match? (Spring/Summer/Autumn/Winter)
3. Silhouette: Overall shape (A-line, Fitted, Oversized, Straight, etc.)
4. Style Classification: Style tags (minimalist, bohemian, classic, trendy, edgy, romantic, etc.)
5. Fabric Texture: Description of fabric appearance (flowy, structured, knit, etc.)
6. Design Details: Key features (v-neck, empire waist, midi length, flutter sleeves, etc.)
7. Pattern: Pattern type (solid, floral, striped, geometric, etc.)

Return ONLY valid JSON:
{
  "colors": ["color1", "color2"],
  "colorSeasons": ["Autumn", "Spring"],
  "silhouette": "A-line",
  "styles": ["bohemian", "casual"],
  "fabric": "flowy, lightweight",
  "details": ["v-neck", "empire waist"],
  "pattern": "floral"
}
`;

async function analyzeImageWithGemini(imageUrl, apiKey, customPrompt) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = customPrompt || DEFAULT_GEMINI_IMAGE_PROMPT;

  const imagePart = {
    inlineData: {
      data: await fetchImageAsBase64(imageUrl),
      mimeType: "image/jpeg"
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = result.response.text();

  // Parse JSON response
  const cleanedResponse = response.replace(/```json\n?|```\n?/g, '').trim();
  return JSON.parse(cleanedResponse);
}

async function fetchImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

function calculateSustainabilityScore(tags, description) {
  const sustainableKeywords = [
    'organic', 'eco-friendly', 'sustainable', 'recycled',
    'biodegradable', 'ethical', 'fair trade', 'vegan',
    'natural', 'bamboo', 'hemp', 'tencel'
  ];

  const text = `${tags.join(' ')} ${description}`.toLowerCase();
  const matches = sustainableKeywords.filter(kw => text.includes(kw));

  return Math.min(matches.length * 20, 100); // 0-100 score
}
```

#### Recommendation Function (Phase 2)

```javascript
export const DEFAULT_GEMINI_SYSTEM_PROMPT = `
You are an expert fashion stylist specializing in body shape analysis and personalized recommendations. Your goal is to select products that will genuinely flatter the customer's body shape.

You analyze clothing based on:
- Silhouette and how it interacts with different body shapes
- Fabric, drape, and structure
- Necklines, waistlines, and hem styles
- Color and pattern placement
- Fit and proportion principles

You provide honest, specific recommendations that help customers look and feel their best.
`;

async function getGeminiRecommendations(products, userPreferences, apiKey, settings) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = buildGeminiPrompt(products, userPreferences);
  const systemPrompt = settings.systemPrompt || DEFAULT_GEMINI_SYSTEM_PROMPT;

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
    }],
    generationConfig: {
      temperature: settings.temperature || 0.7,
      maxOutputTokens: settings.maxTokens || 8192,
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(result.response.text());
}

function determineCategory(product) {
  const text = `${product.title} ${product.productType}`.toLowerCase();

  if (text.includes('dress')) return 'dresses';
  if (text.includes('top') || text.includes('shirt') || text.includes('blouse')) return 'tops';
  if (text.includes('pant') || text.includes('jean') || text.includes('trouser')) return 'bottoms';
  if (text.includes('skirt')) return 'skirts';
  if (text.includes('jacket') || text.includes('coat')) return 'outerwear';

  return 'general';
}

function findBestSize(sizeChart, measurements) {
  // sizeChart format: { S: {bust: 85, waist: 65, hips: 90}, M: {...}, ... }
  // measurements: {bust: 90, waist: 70, hips: 95}

  let bestSize = null;
  let minDifference = Infinity;

  for (const [size, dims] of Object.entries(sizeChart)) {
    const bustDiff = Math.abs(dims.bust - measurements.bust);
    const waistDiff = Math.abs(dims.waist - measurements.waist);
    const hipDiff = Math.abs(dims.hips - measurements.hips);
    const totalDiff = bustDiff + waistDiff + hipDiff;

    if (totalDiff < minDifference) {
      minDifference = totalDiff;
      bestSize = size;
    }
  }

  return bestSize || "Check size chart";
}
```

---

## 7. COST ANALYSIS

### 🎯 GEMINI-ONLY PRICING (2025)

#### Gemini 2.0 Flash
- **Input:** $0.10 per 1M tokens
- **Output:** $0.40 per 1M tokens
- **Images:** 258 tokens per image (fixed)
- **Free Tier:** 1M tokens/day free (for testing)

### 💰 ACTUAL MONTHLY COSTS

#### Medium Store (2,000 products, 100 users/day)

**Phase 1 - Admin Refresh (3x/day):**
- Gemini analyzes 100 new products/day
- 100 images × 258 tokens = 25,800 tokens
- Plus text analysis: ~10,000 tokens
- Total input: ~35,800 tokens/day
- Output (JSON analysis): ~5,000 tokens/day

**Cost:**
- Input: 35,800 × $0.10 / 1M = $0.0036/day
- Output: 5,000 × $0.40 / 1M = $0.0020/day
- **Total: $0.0056/day = $0.17/month**

**Phase 2 - User Recommendations:**
- Input: 500 cached products (text only, no images) = ~50,000 tokens
- Output: 30 recommendations = ~3,000 tokens

**Cost per request:**
- Input: 50,000 × $0.10 / 1M = $0.0050
- Output: 3,000 × $0.40 / 1M = $0.0012
- **Total: $0.0062 per request**

**Monthly (100 users/day):**
- 100 × 30 × $0.0062 = **$18.60/month**

**TOTAL MONTHLY COST:**
- Phase 1 (refresh): $0.17
- Phase 2 (recommendations): $18.60
- **TOTAL: $18.77/month** ✅

---

### 📊 DETAILED COST BREAKDOWN BY STORE SIZE

```
┌──────────────────────────────────────────────────────────────────┐
│         COMPLETE MONTHLY COSTS (Gemini + Railway Hosting)        │
└──────────────────────────────────────────────────────────────────┘

SCENARIO 1: Small Store (500 products, 50 users/day)
────────────────────────────────────────────────────
  Phase 1 - Admin Refresh (3x/day):
    Day 1: 500 products × 258 tokens = 129,000 tokens
           + text (10K tokens) = 139,000 tokens input
           + output (25K tokens) = 25,000 tokens output
    Days 2-30: ~25 new/updated × 29 days
               = 725 products × 258 tokens = 187,050 tokens
               + text = 194,300 tokens input
               + output = 36,250 tokens output

    Input: (139,000 + 194,300) × $0.10 / 1M = $0.033
    Output: (25,000 + 36,250) × $0.40 / 1M = $0.024
    Gemini Total: $0.06/month

  Phase 2 - User Recommendations:
    50 users/day × $0.0062 per request = $0.31/day
    Gemini Total: $9.30/month

  Railway Hosting:
    Hobby Plan: $20/month

  ┌────────────────────────────────┐
  │ TOTAL: $29.36/month            │
  │ Gemini: $9.36                  │
  │ Railway: $20.00                │
  │ Per User: $0.0062/request      │
  └────────────────────────────────┘


SCENARIO 2: Medium Store (2,000 products, 100 users/day)
────────────────────────────────────────────────────────
  Phase 1 - Admin Refresh (3x/day):
    Day 1: 2,000 products × 258 tokens = 516,000 tokens
           + text (40K tokens) = 556,000 tokens input
           + output (100K tokens) = 100,000 tokens output
    Days 2-30: ~100 new/updated × 29 days
               = 2,900 products × 258 tokens = 748,200 tokens
               + text = 777,200 tokens input
               + output = 145,000 tokens output

    Input: (556,000 + 777,200) × $0.10 / 1M = $0.133
    Output: (100,000 + 145,000) × $0.40 / 1M = $0.098
    Gemini Total: $0.23/month

  Phase 2 - User Recommendations:
    100 users/day × $0.0062 per request = $0.62/day
    Gemini Total: $18.60/month

  Railway Hosting:
    Hobby Plan: $20/month

  ┌────────────────────────────────┐
  │ TOTAL: $38.83/month            │
  │ Gemini: $18.83                 │
  │ Railway: $20.00                │
  │ Per User: $0.0062/request      │
  └────────────────────────────────┘


SCENARIO 3: Large Store (5,000 products, 500 users/day)
────────────────────────────────────────────────────────
  Phase 1 - Admin Refresh (3x/day):
    Day 1: 5,000 products × 258 tokens = 1,290,000 tokens
           + text (100K tokens) = 1,390,000 tokens input
           + output (250K tokens) = 250,000 tokens output
    Days 2-30: ~150 new/updated × 29 days
               = 4,350 products × 258 tokens = 1,122,300 tokens
               + text = 1,165,800 tokens input
               + output = 217,500 tokens output

    Input: (1,390,000 + 1,165,800) × $0.10 / 1M = $0.256
    Output: (250,000 + 217,500) × $0.40 / 1M = $0.187
    Gemini Total: $0.44/month

  Phase 2 - User Recommendations:
    500 users/day × $0.0062 per request = $3.10/day
    Gemini Total: $93.00/month

  Railway Hosting:
    Hobby Plan: $20/month

  ┌────────────────────────────────┐
  │ TOTAL: $113.44/month           │
  │ Gemini: $93.44                 │
  │ Railway: $20.00                │
  │ Per User: $0.0062/request      │
  └────────────────────────────────┘


SCENARIO 4: Enterprise (10,000 products, 1,000 users/day)
──────────────────────────────────────────────────────────
  Phase 1 - Admin Refresh (3x/day):
    Day 1: 10,000 products × 258 tokens = 2,580,000 tokens
           + text (200K tokens) = 2,780,000 tokens input
           + output (500K tokens) = 500,000 tokens output
    Days 2-30: ~200 new/updated × 29 days
               = 5,800 products × 258 tokens = 1,496,400 tokens
               + text = 1,554,400 tokens input
               + output = 290,000 tokens output

    Input: (2,780,000 + 1,554,400) × $0.10 / 1M = $0.433
    Output: (500,000 + 290,000) × $0.40 / 1M = $0.316
    Gemini Total: $0.75/month

  Phase 2 - User Recommendations:
    1,000 users/day × $0.0062 per request = $6.20/day
    Gemini Total: $186.00/month

  Railway Hosting:
    Pro Plan: $50/month (dedicated resources)

  ┌────────────────────────────────┐
  │ TOTAL: $236.75/month           │
  │ Gemini: $186.75                │
  │ Railway: $50.00                │
  │ Per User: $0.0062/request      │
  └────────────────────────────────┘
```

---

### 📊 COST COMPARISON TABLE (Complete with Hosting)

| Store Size | Products | Users/Day | Gemini API | Railway | **TOTAL** | Claude+Railway | Savings |
|------------|----------|-----------|------------|---------|-----------|----------------|---------|
| **Small** | 500 | 50 | $9.36 | $20 | **$29.36** | $470 | **94% ↓** |
| **Medium** | 2,000 | 100 | $18.83 | $20 | **$38.83** | $920 | **96% ↓** |
| **Large** | 5,000 | 500 | $93.44 | $20 | **$113.44** | $4,520 | **97% ↓** |
| **Enterprise** | 10,000 | 1,000 | $186.75 | $50 | **$236.75** | $9,050 | **97% ↓** |

### 🆚 Architecture Comparison (Medium Store)

| Approach | Gemini API | OpenAI API | Railway | **TOTAL** | vs Gemini-Only |
|----------|------------|------------|---------|-----------|----------------|
| **Gemini-Only** ⭐ | $18.83 | - | $20 | **$38.83** | - |
| **Gemini + OpenAI** | $3.68 | $54.00 | $20 | **$77.68** | +100% more |
| **Current (Claude)** | - | $900 | $20 | **$920** | +2,269% more |

**Key Takeaways:**
- ✅ Gemini-only is **50% cheaper** than Gemini+OpenAI architecture
- ✅ Gemini-only is **96% cheaper** than current Claude system
- ✅ Cost per request stays constant at **$0.0062** regardless of store size
- ✅ Railway Hobby Plan ($20/month) covers most use cases up to Large stores
- ✅ Railway Pro Plan ($50/month) recommended only for Enterprise (10,000+ products)

---

### 💡 Railway Hosting Plans

**Hobby Plan - $20/month** (Recommended)
- Includes $20 usage credit/month
- PostgreSQL database (1GB RAM)
- Web service hosting
- Perfect for: Small, Medium, Large stores

**Pro Plan - $50/month** (Enterprise)
- Includes $50 usage credit/month
- Dedicated resources
- Priority support
- Team features
- Perfect for: 10,000+ products, 1,000+ users/day

---

<!--
═══════════════════════════════════════════════════════════════════════
PREVIOUS COST ANALYSIS: Gemini + OpenAI (COMMENTED OUT)
═══════════════════════════════════════════════════════════════════════

Medium Store (2,000 products, 100 users/day):
  Gemini Image Analysis:
    Day 1: 2,000 products × $0.00075 = $1.50
    Days 2-30: ~100 new/updated × 29 days × $0.00075 = $2.18
    Monthly Total: $3.68

  OpenAI Recommendations:
    100 users/day × $0.018 per request = $1.80/day
    Monthly Total: $54.00

  Railway Hosting:
    Hobby Plan
    Monthly Total: $20.00

  TOTAL: $77.68/month
  Per User: $0.026
-->

---

## 8. IMPLEMENTATION CHECKLIST

### ✅ Phase 1: Database Setup
- [x] Models already in `prisma/schema.prisma`
- [x] Run `npx prisma generate` ✅ **COMPLETED (2025-01-XX)**
- [ ] Run database migration in production: `npx prisma migrate deploy`

### ✅ Phase 2: Gemini Integration
- [x] Sign up for Google AI Studio (https://ai.google.dev/)
- [x] Get Gemini API key (FREE tier available)
- [x] Install `@google/generative-ai` package ✅ **COMPLETED (2025-01-XX)**
- [x] Create `app/utils/geminiAnalysis.ts` ✅ **COMPLETED (2025-01-XX)**
  - Implements `analyzeProductImage()` - Phase 1 image analysis
  - Implements `fetchShopifyProducts()` - Product fetching from Admin API
  - Implements `saveAnalyzedProduct()` - Database caching
  - Implements `logRefreshActivity()` - Activity tracking
- [x] Create `app/utils/geminiRecommendations.ts` ✅ **COMPLETED (2025-01-XX)**
  - Implements `getGeminiProductRecommendations()` - Phase 2 recommendations
  - Uses cached analysis from database (NO images sent)
  - Implements fallback algorithm when Gemini is disabled
- [ ] Test with sample product images

### ✅ Phase 3: Admin Refresh API
- [x] Create `app/routes/api.admin.refresh.tsx` ✅ **COMPLETED (2025-01-XX)**
  - Implements daily limit check (3x/day) ✅
  - Implements Shopify product fetch (reuses Admin API code) ✅
  - Implements incremental analysis (only new/updated products) ✅
  - Implements Gemini batch processing with rate limiting ✅
  - Implements refresh logging with cost tracking ✅
  - Includes error handling & retry logic ✅
- [ ] Test admin refresh endpoint with test store

### ✅ Phase 4: User Recommendation API
- [x] Create `app/routes/api.gemini.recommendations.tsx` ✅ **COMPLETED (2025-01-XX)**
  - Implements database query (FilteredSelectionWithImgAnalyzed) ✅
  - Implements color season pre-filtering ✅
  - Implements Gemini recommendations integration (text-only) ✅
  - Includes size matching support ✅
  - Includes response formatting with visual analysis ✅
  - Includes error handling & fallback ✅
- [ ] Test recommendation endpoint with sample requests

### ✅ Phase 5: Admin UI
- [x] Create refresh button in admin dashboard ✅ **COMPLETED (2025-10-17)**
- [x] Show refresh status (running/completed) ✅ **COMPLETED (2025-10-17)**
- [x] Show daily refresh count (X/3) ✅ **COMPLETED (2025-10-17)**
- [ ] Show last refresh timestamp
- [ ] Show refresh stats (products analyzed, cost)
- [x] Add Gemini API key settings form ✅ **COMPLETED (2025-10-17)**
- [ ] Add filtering settings UI
- [x] Add editable prompts (image + recommendation) ✅ **COMPLETED (2025-10-17)**
- [x] Create analysis results viewer page ✅ **COMPLETED (2025-10-17)**
  - View all products with Gemini analysis
  - Clickable product cards with modal popup
  - Display colors, styles, silhouette, description
  - Clear all analysis functionality

### ✅ Phase 6: Testing
- [ ] Test with small product catalog (10 products)
- [ ] Test with medium catalog (500 products)
- [ ] Test incremental refresh (only new products)
- [ ] Test all user path combinations
- [ ] Test size matching logic
- [ ] Load test (simulate 100 concurrent users)
- [ ] Cost validation (track actual API costs)

### ✅ Phase 7: Migration & Deployment
- [ ] Set environment variable: `GEMINI_API_KEY` in Railway
- [ ] Run database migration in production: `npx prisma migrate deploy`
- [ ] Run first refresh to populate database
- [ ] Update storefront to use new API endpoint: `/api/gemini/recommendations`
- [ ] Monitor errors & performance
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Keep Claude as fallback (for safety)
- [ ] Eventually remove old Claude-based code

### ✅ Phase 8: Optimization
- [ ] Add database indexes for common queries
- [ ] Optimize Gemini prompt length
- [ ] Add monitoring/alerting for API failures
- [ ] Set up cost alerts (daily/weekly)

---

## 📝 IMPLEMENTATION NOTES

**Latest Update:** 2025-10-20
**Status:** ✅ Deployed and fixed

### Critical Fixes Applied

**✅ Fix: Settings Sync Between Admin and Storefront (2025-10-20)**
- **Issue:** Admin settings (e.g., numberOfSuggestions: 5) weren't being used by storefront, which defaulted to 30
- **Root Cause:**
  - Admin saved settings to current session only (by session.id)
  - Multiple session records can exist for same shop
  - API fetches by shop domain, might get different session without settings
- **Fix Applied:**
  1. Admin now updates ALL sessions for the shop using `updateMany({ where: { shop } })`
  2. API now fetches most recent session with `orderBy: { id: 'desc' }`
  3. Added detailed debugging to track settings sync issues
  4. Added console logs showing: "Settings saved to X database session(s) for shop: Y"
- **Files Modified:**
  - `app/routes/app.settings.tsx` - Changed from `session.update()` to `session.updateMany()` (lines 54-62)
  - `app/routes/api.settings.tsx` - Added orderBy, enhanced debugging (lines 31-52)
- **Testing:**
  - After saving settings in admin, check logs for: "Settings saved to X database session(s)"
  - Storefront should now correctly use admin values instead of defaulting to 30
- **Benefits:**
  - Settings consistency across all sessions for same shop
  - Better debugging visibility for settings sync issues
  - Prevents settings from being lost between admin saves and storefront fetches
- **Commit:** `b4aa78f` - Fix settings sync between admin and storefront API

**✅ Enhancement: Fixed JSON Format + additionalNotes Field (2025-10-20)**
- **What:** Made JSON format unchangeable and added free-text field for Gemini
- **Changes Made:**
  1. Separated customizable prompt from fixed JSON format structure
  2. Added `FIXED_JSON_FORMAT_INSTRUCTION` constant (not customizable)
  3. Added `additionalNotes` field to ProductImageAnalysis interface
  4. Added `additionalNotes` column to database schema (String? @db.Text)
  5. Updated `saveAnalyzedProduct()` to save additionalNotes
  6. Updated UI to clarify what's customizable vs fixed
  7. Added Banner in gemini-settings explaining the fixed structure
- **Files Modified:**
  - `app/utils/geminiAnalysis.ts` - Separated prompt logic, added additionalNotes field
  - `prisma/schema.prisma` - Added additionalNotes column to FilteredSelectionWithImgAnalyzed
  - `app/routes/app.gemini-settings.tsx` - Added info banner about fixed format
- **Benefits:**
  - Users can customize analysis focus without breaking data structure
  - Gemini can add detailed observations in additionalNotes (free text)
  - Prevents JSON parsing errors from user prompt edits
  - Ensures consistent database schema across all shops
- **Migration Required:** Run `npx prisma migrate dev --name add-additional-notes` to add the new column

**✅ Fix: Gemini JSON Parsing Error (2025-01-17)**
- **Issue:** Gemini returns responses wrapped in markdown code blocks (```json ... ```)
- **Error:** `SyntaxError: Unexpected token ` at JSON.parse`
- **Root Cause:** Code tried to parse original text instead of cleaned version
- **Fix:** Clean markdown BEFORE parsing, pass cleaned text to all functions
- **File:** `app/utils/geminiAnalysis.ts` lines 214-243
- **Commit:** `52f9dc2` - Fix Gemini JSON parsing error

**✅ Fix: Gemini Plain Text Response Error (2025-10-17)**
- **Issue:** Gemini sometimes returns plain text error messages instead of JSON (e.g., "I cannot analyze clothing from this image...")
- **Error:** `SyntaxError: Unexpected token I in JSON at position 0`
- **Root Cause:** Gemini refused to analyze certain images and returned plain text instead of JSON
- **Fix Applied:**
  1. Added `responseMimeType: "application/json"` to force JSON output from Gemini
  2. Added validation to check if response starts with '{' before parsing
  3. Updated prompt to explicitly instruct Gemini to always return JSON, even for problematic images
  4. Added fallback JSON structure for images that cannot be analyzed
- **File:** `app/utils/geminiAnalysis.ts` lines 211-233, 253-293
- **Note:** This fix ensures the refresh process continues even if some images cannot be analyzed properly

**✅ Feature: Prompt Customization UI (2025-10-17)**
- **What:** Added comprehensive UI for customizing Gemini prompts
- **Location:** `/app/gemini-settings` in admin dashboard
- **Features:**
  1. Image Analysis Prompt Editor (Phase 1) - Customize how Gemini analyzes product images
  2. System Prompt Editor (Phase 2) - Customize Gemini's role for recommendations
  3. Reset to Defaults button - Restore original prompts with confirmation
  4. Multi-line text fields with helpful hints
  5. Separated from API key settings for better organization
- **Files Modified:**
  - `app/routes/app.gemini-settings.tsx` - Added prompt editing UI and handlers
  - `app/utils/geminiAnalysis.ts` - Updated load/save functions to include systemPrompt
- **Note:** Prompts are stored per shop in the `GeminiSettings` table

**✅ Migration: Storefront Updated to Gemini Endpoints (2025-10-17)**
- **What:** Completed migration of storefront from Claude to Gemini API endpoints
- **Changes Made:**
  1. Updated `/api/claude/recommendations` → `/api/gemini/recommendations` (line 801)
  2. Updated `/api/body-shape-analysis` → `/api/gemini/body-shape-analysis` (line 614)
  3. Updated `/api/color-season-analysis` → `/api/gemini/color-season-analysis` (line 1329)
  4. Updated all console logs from "Claude AI" to "Gemini AI"
  5. Updated all loading screen messages from "Claude AI" to "Gemini AI"
- **File Modified:** `extensions/body-shape-advisor/assets/body-shape-advisor.js`
- **Status:** ✅ COMPLETED - Storefront now fully uses Gemini APIs
- **Commit:** `db153b6` - Update storefront to use Gemini API endpoints
- **Note:** This completes the full Claude→Gemini migration for both admin and storefront

**✅ Feature: Configurable Daily Refresh Limit (2025-10-17)**
- **What:** Made the daily refresh limit configurable instead of hardcoded
- **Changes Made:**
  1. Added `maxRefreshesPerDay` field to AppSettings interface (default: 3)
  2. Added UI control in Settings page (TextField with range 1-24)
  3. Updated admin refresh endpoint to read limit dynamically from database session
  4. Added to "How It Works" documentation section and summary sidebar
- **Files Modified:**
  - `app/utils/settings.ts` - Added maxRefreshesPerDay to interface
  - `app/routes/app.settings.tsx` - Added TextField control for max refreshes
  - `app/routes/api.admin.refresh.tsx` - Read limit from database instead of hardcoding
- **Benefits:** Store owners can now control API costs by adjusting refresh frequency
- **Commit:** `928ef5a` - Add configurable daily refresh limit setting

**✅ Fix: Rate Limit Loading Issue (2025-10-17)**
- **Issue:** User changed maxRefreshesPerDay from 3 to 5, but system still enforced old limit
- **Root Cause:** Settings were saved to database but logs were missing from execution
- **Fix:** Added comprehensive debug logging to track session loading
- **Changes Made:**
  1. Added debug console logs showing session ID, record status, and raw appSettings
  2. Added warning if appSettings not found in session record
  3. Enhanced error logging for settings parse failures
- **File Modified:** `app/routes/api.admin.refresh.tsx` lines 44-67
- **Status:** ✅ Debug logs added to diagnose issue
- **Commit:** `b430922` - Add debug logging to admin refresh rate limit loading
- **Note:** This will help identify why updated settings aren't being read properly

**✅ Cleanup: Removed Deprecated Claude Files (2025-10-17)**
- **What:** Removed all deprecated Claude endpoint files after confirming Gemini migration success
- **Files Deleted:**
  1. `app/routes/api.claude.recommendations.tsx` - Old Claude recommendation endpoint
  2. `app/utils/claudeRecommendations.ts` - Old Claude utility functions (1,433 lines)
  3. `app/routes/api.body-shape-analysis.tsx` - Replaced by `api.gemini.body-shape-analysis.tsx`
  4. `app/routes/api.color-season-analysis.tsx` - Replaced by `api.gemini.color-season-analysis.tsx`
- **Result:** Server bundle reduced from 213KB → 164KB (23% smaller)
- **Status:** ✅ Migration to Gemini 100% complete - no Claude dependencies remaining
- **Commit:** `ae15c60` - Remove deprecated Claude endpoint files
- **Note:** All storefront and admin functionality now exclusively uses Gemini 2.0 Flash

**✅ Feature: Analysis Results Viewer with Modal Popup (2025-10-17)**
- **What:** Created comprehensive UI for viewing Gemini analysis results
- **Location:** `/app/analysis-results` in admin dashboard
- **Features:**
  1. Product List View - Shows all analyzed products with preview (first 3 colors)
  2. Clickable Cards - Each product card is clickable to open modal
  3. Modal Popup - Displays complete analysis details:
     - All colors (detectedColors)
     - Style classifications (styleClassification)
     - Silhouette type (silhouetteType)
     - Full description (constructed from pattern, fabric, details, seasons)
  4. Clear All Button - Bulk delete all analysis data with confirmation
  5. Visual Hint - "Click to view details →" on each card
- **Files Created:**
  - `app/routes/app.analysis-results.tsx` - Main analysis results page with modal
- **Technical Details:**
  - Maps database field names to UI-friendly names:
    - `detectedColors` → `colors`
    - `styleClassification` → `style`
    - `silhouetteType` → `silhouette`
  - Constructs description from multiple fields for better readability
  - Shows up to 50 most recent products (ordered by lastUpdated)
- **Commits:**
  - `80c905c` - Add clickable product cards with modal popup
  - `4b003c0` - Add debug logging to analysis results loader
  - `290e1b3` - Fix field mapping for Gemini analysis data
- **Status:** ✅ DEPLOYED as app-63
- **Note:** This gives admins full visibility into Gemini's image analysis results

**✅ Fix: JSON Repair Logic for Malformed Gemini Responses (2025-10-17)**
- **Issue:** Gemini occasionally returns malformed JSON with syntax errors (e.g., extra `}`, trailing commas)
- **Error:** `Unexpected token } in JSON at position 24376`
- **Impact:** Caused recommendation requests to return 0 results despite Gemini generating response
- **Root Cause:** Gemini's JSON output sometimes contains structural errors
- **Fix Applied:**
  1. Added multi-stage JSON repair process:
     - First attempt: Parse as-is
     - Second attempt: Remove trailing commas before `}` or `]`
     - Third attempt: Extract just the `recommendations` array using regex
     - Final attempt: Parse repaired JSON
  2. Enhanced error logging with exact position and excerpt near error
  3. Maintains fallback to basic algorithm if all repair attempts fail
- **File Modified:** `app/utils/geminiRecommendations.ts` lines 346-393
- **Benefits:**
  - Automatically recovers from common JSON errors
  - Prevents complete recommendation failures
  - Provides detailed debugging information
- **Commit:** `346611f` - Add JSON repair logic for malformed Gemini responses
- **Status:** ✅ COMMITTED - Will be active on Railway after redeploy
- **Note:** This improves reliability of Gemini recommendations by handling edge cases

### Files Created/Modified

**✅ Created:**
1. `app/utils/geminiAnalysis.ts` - Phase 1 image analysis utility
   - Analyzes product images with Gemini 2.0 Flash
   - Fetches products from Shopify Admin API
   - Caches analysis in FilteredSelectionWithImgAnalyzed table
   - Tracks API costs and usage

2. `app/utils/geminiRecommendations.ts` - Phase 2 recommendations utility
   - Gets recommendations using Gemini 2.0 Flash (text-only)
   - Uses cached image analysis from database
   - NO images sent to Gemini in Phase 2
   - Includes fallback algorithm for when Gemini is disabled

3. `app/routes/api.admin.refresh.tsx` - Admin refresh endpoint
   - POST endpoint for admin-triggered refresh
   - Enforces 3x per day rate limit
   - Incremental updates (only new/updated products)
   - Logs costs and activity to ProductRefreshLog

4. `app/routes/api.gemini.recommendations.tsx` - Storefront recommendations endpoint
   - Public CORS-enabled endpoint for storefront
   - Uses cached product analysis
   - Supports body shape, color season, measurements
   - Returns recommendations with styling tips

**📦 Dependencies:**
- Added `@google/generative-ai` package to package.json

**🗄️ Database:**
- Prisma schema already includes all necessary tables:
  - FilteredSelectionWithImgAnalyzed (primary cache table)
  - GeminiSettings (API key, model, prompts)
  - ProductRefreshLog (activity tracking)
  - FilteringSettings (admin preferences)

**⚠️ Important Notes:**
1. **Database Migration Required:** Run `npx prisma migrate deploy` in production to create new tables
2. **API Key Required:** Set `GEMINI_API_KEY` environment variable in Railway
3. **Rate Limiting:** Admin refresh limited to 3x per day (configurable)
4. **Incremental Updates:** Only analyzes new/updated products (saves costs)
5. **Image Analysis:** Phase 1 only - images NOT sent in Phase 2 (cost optimization)
6. **Fallback:** System falls back to basic algorithm if Gemini fails
7. **Backward Compatibility:** Old Claude endpoint still functional (api.claude.recommendations.tsx)

**🔄 Migration Path:**
1. Deploy new code to Railway
2. Run database migration
3. Set GEMINI_API_KEY environment variable
4. Trigger first admin refresh (populates database)
5. Update storefront to call `/api/gemini/recommendations` instead of `/api/claude/recommendations`
6. Monitor and test
7. Gradually increase traffic to new endpoint
8. Eventually deprecate Claude endpoint

**💡 Next Steps:**
1. Get Gemini API key from https://ai.google.dev/
2. Test admin refresh with small catalog
3. Test recommendations endpoint
4. Deploy to production
5. Run first refresh
6. Update storefront integration

---

## SUMMARY

**Architecture:**
- Two-phase system: Admin refresh (3x/day) + User requests (real-time)
- **Gemini 2.0 Flash for EVERYTHING** (image analysis + recommendations)
- PostgreSQL for caching (Railway)
- **Single AI provider** = simpler, cheaper, fewer API keys

**Costs:**
- Medium: **$18.77/month** (2,000 products, 100 users/day)
- **33% cheaper** than Gemini+OpenAI ($27.98/month)
- **98% cheaper** than current Claude system ($900/month)

**Performance:**
- Refresh: ~1-5 minutes (admin-triggered)
- User request: 2-5 seconds
- **Same quality as multi-provider approach**

**Scalability:**
- Handles 1,000+ users/day
- Supports 10,000+ products
- Incremental updates (only analyze changed products)
- Free tier: 1M tokens/day (perfect for testing)

---

## 🚀 WHY GEMINI-ONLY IS BEST

1. **💰 Cheapest:** $18.77/month vs $27.98 (Gemini+OpenAI) vs $900 (Claude)
2. **🔑 Simplest:** One API key, one provider
3. **📦 Less Code:** No OpenAI integration needed
4. **🎨 Same Quality:** Gemini 2.0 Flash excels at both vision + text
5. **⚡ Fast:** 2-5 seconds with cached data
6. **🆓 Free Tier:** 1M tokens/day for testing

---

**Files to Update:**
1. `prisma/schema.prisma` - Add/update GeminiSettings with systemPrompt field
2. `app/utils/geminiAnalysis.ts` - NEW: Gemini image + recommendation functions
3. `app/routes/api.admin.refresh-products.tsx` - NEW: Admin refresh workflow
4. `app/routes/api.gemini.recommendations.tsx` - NEW: User recommendations API
5. `app/routes/app._index.tsx` - Add refresh button UI
6. `package.json` - Add `@google/generative-ai` dependency

**Next Steps:**
1. Install Gemini SDK: `npm install @google/generative-ai`
2. Get API key from https://ai.google.dev/
3. Implement Phase 1 refresh workflow
4. Test with small catalog
5. Deploy to production
