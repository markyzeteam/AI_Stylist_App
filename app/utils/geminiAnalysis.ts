import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db.server";
import prisma from "../db.server";

/**
 * PHASE 1: Gemini Image Analysis Utility
 *
 * This file handles image analysis of products using Gemini 2.0 Flash.
 * Used by the admin refresh endpoint to analyze and cache product data.
 */

export interface GeminiSettings {
  apiKey?: string;
  model: string;
  prompt?: string;
  systemPrompt?: string;
  bodyShapePrompt?: string;
  colorSeasonPrompt?: string;
  celebrityPrompt?: string;
  valuesPrompt?: string;
  enabled: boolean;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  batchSize?: number;
  enableRateLimiting?: boolean;
  useImageAnalysis?: boolean;
  budgetLowMax?: number;
  budgetMediumMax?: number;
  budgetHighMax?: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  batchSize: number;
  enableRateLimiting: boolean;
}

export interface ProductImageAnalysis {
  detectedColors: string[];
  colorSeasons: string[];
  silhouetteType?: string;
  styleClassification: string[];
  fabricTexture?: string;
  designDetails: string[];
  patternType?: string;
  additionalNotes?: string;
  rawAnalysis: any;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle?: string;
  description?: string;
  productType?: string;
  tags?: string[];
  price: string;
  imageUrl?: string;
  variants?: any[];
  inStock?: boolean;
  availableSizes?: string[];
  inventoryQuantity?: number;
  totalSold?: number;
  publishedAt?: Date;
  compareAtPrice?: string;
}

// Default prompt for Gemini image analysis (CUSTOMIZABLE PART)
export const DEFAULT_GEMINI_SYSTEM_PROMPT = `You are an expert fashion analyst with deep knowledge of:
- Color theory and seasonal color analysis (Spring, Summer, Autumn, Winter)
- Clothing silhouettes and fit types
- Fabric textures and materials
- Fashion design details and styling elements
- Pattern types and print styles

Your task is to analyze clothing product images with precision and consistency.`;

// PROMPT 2: Customer Analysis (combines body + color + values + celebrity)
export const DEFAULT_GEMINI_CUSTOMER_ANALYSIS_PROMPT = `You are a comprehensive fashion advisor with expertise in body shape analysis, color theory, personal values alignment, and celebrity style inspiration.

Your role is to provide warm, encouraging, and highly personalized guidance that helps customers understand their unique style profile. You analyze their:

1. **Body Shape & Proportions**: Provide kind, confidence-building advice about their body shape, what works well, and styling strategies that make them feel amazing.

2. **Color Season & Flattering Colors**: Make color theory accessible and exciting. Explain their color season, best colors, and how to incorporate them into their wardrobe.

3. **Shopping Values & Preferences**: Help them align their wardrobe with their values—whether sustainability, budget consciousness, or specific style aesthetics. Provide practical, actionable advice.

4. **Celebrity Style Icons**: Connect them with celebrities who share their body shape, color season, and style preferences. Provide specific styling inspiration they can apply.

Make every customer feel seen, understood, and excited about their personal style journey. Be specific, practical, and empowering in all recommendations.`;

// PROMPT 3: Product Recommendations System Prompt
export const DEFAULT_GEMINI_RECOMMENDATION_PROMPT = `You are an expert fashion stylist and personal shopper with deep knowledge of body proportions and style optimization. Your goal is to select products that will genuinely flatter the customer's body shape and color season preferences.

You analyze clothing based on:
- Silhouette and how it interacts with different body shapes
- Color harmony with seasonal color analysis
- Fabric, drape, and structure
- Necklines, waistlines, and hem styles
- Design details and pattern placement
- Fit and proportion principles

You provide honest, specific recommendations that help customers look and feel their best.`;

export const DEFAULT_GEMINI_IMAGE_PROMPT = `Analyze this clothing product image and provide detailed visual analysis.

Extract the following information:

1. **detectedColors**: Array of primary colors visible in the garment (max 5 colors, use common color names)
2. **colorSeasons**: Which seasonal color palettes does this suit? Array from: ["Spring", "Summer", "Autumn", "Winter"]
3. **silhouetteType**: The overall silhouette (e.g., "A-line", "Fitted", "Oversized", "Straight", "Wrap", "Empire")
4. **styleClassification**: Style categories (e.g., ["Casual", "Formal", "Bohemian", "Minimalist", "Sporty"])
5. **fabricTexture**: Apparent fabric type (e.g., "Smooth silk", "Textured knit", "Denim", "Flowing chiffon")
6. **designDetails**: Notable design elements (e.g., ["V-neckline", "Puff sleeves", "Side pockets", "Pleated skirt"])
7. **patternType**: Pattern classification (e.g., "Solid", "Striped", "Floral", "Geometric", "Polka dot")
8. **additionalNotes**: Any other relevant observations or styling notes (free text)`;

// FIXED JSON FORMAT (NOT CUSTOMIZABLE - ensures consistent data structure)
const FIXED_JSON_FORMAT_INSTRUCTION = `

CRITICAL: You MUST always return valid JSON. Even if the image is unclear, contains logos only, or you cannot fully analyze it, still return JSON with empty arrays or "Unknown" values.

Return ONLY valid JSON in this exact format (no markdown, no extra text, no explanations):
{
  "detectedColors": ["color1", "color2"],
  "colorSeasons": ["Spring", "Summer"],
  "silhouetteType": "A-line",
  "styleClassification": ["Casual", "Bohemian"],
  "fabricTexture": "Flowing cotton",
  "designDetails": ["V-neckline", "Short sleeves"],
  "patternType": "Floral",
  "additionalNotes": "Optional free-text notes about the garment"
}

If you cannot analyze the image properly, return:
{
  "detectedColors": [],
  "colorSeasons": [],
  "silhouetteType": "Unknown",
  "styleClassification": ["Unknown"],
  "fabricTexture": "Unknown",
  "designDetails": [],
  "patternType": "Unknown",
  "additionalNotes": ""
}`;

/**
 * Load Gemini settings from database for a specific shop
 */
export async function loadGeminiSettings(shop: string): Promise<GeminiSettings> {
  try {
    const settings = await db.geminiSettings.findUnique({
      where: { shop },
    });

    if (settings) {
      return {
        apiKey: settings.apiKey || undefined,
        model: settings.model || "gemini-2.0-flash-exp",
        prompt: settings.prompt || DEFAULT_GEMINI_IMAGE_PROMPT,
        customerAnalysisPrompt: settings.customerAnalysisPrompt || DEFAULT_GEMINI_CUSTOMER_ANALYSIS_PROMPT,
        systemPrompt: settings.systemPrompt || DEFAULT_GEMINI_RECOMMENDATION_PROMPT,
        enabled: settings.enabled,
        requestsPerMinute: settings.requestsPerMinute,
        requestsPerDay: settings.requestsPerDay,
        batchSize: settings.batchSize,
        enableRateLimiting: settings.enableRateLimiting,
        useImageAnalysis: settings.useImageAnalysis,
        budgetLowMax: settings.budgetLowMax ? Number(settings.budgetLowMax) : undefined,
        budgetMediumMax: settings.budgetMediumMax ? Number(settings.budgetMediumMax) : undefined,
        budgetHighMax: settings.budgetHighMax ? Number(settings.budgetHighMax) : undefined,
      };
    }

    // Return defaults if no settings found
    return {
      apiKey: undefined,
      model: "gemini-2.0-flash-exp",
      prompt: DEFAULT_GEMINI_IMAGE_PROMPT,
      customerAnalysisPrompt: DEFAULT_GEMINI_CUSTOMER_ANALYSIS_PROMPT,
      systemPrompt: DEFAULT_GEMINI_RECOMMENDATION_PROMPT,
      enabled: true,
      requestsPerMinute: 15,
      requestsPerDay: 1500,
      batchSize: 10,
      enableRateLimiting: true,
      useImageAnalysis: true,
    };
  } catch (error) {
    console.error("Error loading Gemini settings:", error);
    return {
      apiKey: undefined,
      model: "gemini-2.0-flash-exp",
      prompt: DEFAULT_GEMINI_IMAGE_PROMPT,
      customerAnalysisPrompt: DEFAULT_GEMINI_CUSTOMER_ANALYSIS_PROMPT,
      systemPrompt: DEFAULT_GEMINI_RECOMMENDATION_PROMPT,
      enabled: true,
      requestsPerMinute: 15,
      requestsPerDay: 1500,
      batchSize: 10,
      enableRateLimiting: true,
      useImageAnalysis: true,
    };
  }
}

/**
 * Save Gemini settings to database
 */
export async function saveGeminiSettings(
  shop: string,
  settings: GeminiSettings
): Promise<boolean> {
  try {
    console.log("INFO: Saving Gemini settings:", {
      shop,
      budgetLowMax: settings.budgetLowMax,
      budgetMediumMax: settings.budgetMediumMax,
      budgetHighMax: settings.budgetHighMax,
    });

    await db.geminiSettings.upsert({
      where: { shop },
      update: {
        apiKey: settings.apiKey,
        model: settings.model,
        prompt: settings.prompt,
        systemPrompt: settings.systemPrompt,
        bodyShapePrompt: settings.bodyShapePrompt,
        colorSeasonPrompt: settings.colorSeasonPrompt,
        celebrityPrompt: settings.celebrityPrompt,
        valuesPrompt: settings.valuesPrompt,
        enabled: settings.enabled,
        requestsPerMinute: settings.requestsPerMinute,
        requestsPerDay: settings.requestsPerDay,
        batchSize: settings.batchSize,
        enableRateLimiting: settings.enableRateLimiting,
        useImageAnalysis: settings.useImageAnalysis,
        budgetLowMax: settings.budgetLowMax,
        budgetMediumMax: settings.budgetMediumMax,
        budgetHighMax: settings.budgetHighMax,
        updatedAt: new Date(),
      },
      create: {
        shop,
        apiKey: settings.apiKey,
        model: settings.model,
        prompt: settings.prompt,
        systemPrompt: settings.systemPrompt,
        bodyShapePrompt: settings.bodyShapePrompt,
        colorSeasonPrompt: settings.colorSeasonPrompt,
        celebrityPrompt: settings.celebrityPrompt,
        valuesPrompt: settings.valuesPrompt,
        enabled: settings.enabled,
        requestsPerMinute: settings.requestsPerMinute || 15,
        requestsPerDay: settings.requestsPerDay || 1500,
        batchSize: settings.batchSize || 10,
        enableRateLimiting: settings.enableRateLimiting ?? true,
        useImageAnalysis: settings.useImageAnalysis ?? true,
        budgetLowMax: settings.budgetLowMax || 30,
        budgetMediumMax: settings.budgetMediumMax || 80,
        budgetHighMax: settings.budgetHighMax || 200,
      },
    });

    console.log("INFO: Gemini settings saved successfully for shop:", shop);
    return true;
  } catch (error) {
    console.error("ERROR: Error saving Gemini settings:", error);
    return false;
  }
}

/**
 * Analyze a single product image using Gemini
 */
/**
 * Retry helper with exponential backoff for API calls
 * Exported for reuse in other modules
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a retryable error (503, 429, network issues)
      const isRetryable =
        error?.status === 503 ||
        error?.status === 429 ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('rate limit');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.3 * delay; // Add 0-30% jitter
      const totalDelay = delay + jitter;

      console.log(`INFO: Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError;
}

/**
 * Delay helper to add spacing between API calls
 */
async function delayBetweenCalls(ms: number = 500): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function analyzeProductImage(
  imageUrl: string,
  shop: string,
  productTitle: string
): Promise<ProductImageAnalysis | null> {
  try {
    // Load settings
    const settings = await loadGeminiSettings(shop);

    if (!settings.enabled) {
      console.log(`INFO: Gemini image analysis disabled for ${shop}`);
      return null;
    }

    // Get API key
    const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ERROR: No Gemini API key configured");
      return null;
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: settings.model });

    console.log(`INFO: Analyzing image for: ${productTitle}`);

    // Fetch image as base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`ERROR: Failed to fetch image: ${imageResponse.statusText}`);
      return null;
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Determine mime type from URL
    const mimeType = imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Build prompt with system instructions + fixed format (always appended)
    const customPrompt = settings.prompt || DEFAULT_GEMINI_IMAGE_PROMPT;
    const fullPrompt = `${DEFAULT_GEMINI_SYSTEM_PROMPT}

${customPrompt}

Product Title: ${productTitle}

${FIXED_JSON_FORMAT_INSTRUCTION}`;

    // Add small delay before API call to avoid overwhelming the service
    await delayBetweenCalls(500);

    // Call Gemini with image and enforce JSON output - with retry logic
    const result = await retryWithBackoff(() => model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: fullPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }));

    const response = await result.response;
    const text = response.text();

    console.log(`INFO: Gemini response received (${text.length} chars)`);

    // Clean markdown if present
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/```\n?/g, "");
    }

    // Parse JSON response
    const analysis = parseGeminiAnalysis(cleanedText);

    if (!analysis) {
      console.error("ERROR: Failed to parse Gemini analysis");
      return null;
    }

    // Parse the cleaned text for rawAnalysis
    let rawAnalysis;
    try {
      rawAnalysis = JSON.parse(cleanedText);
    } catch (error) {
      console.error("ERROR: Failed to parse raw analysis:", error);
      console.error("   Cleaned text:", cleanedText.substring(0, 500));
      rawAnalysis = null;
    }

    return {
      ...analysis,
      rawAnalysis,
    };
  } catch (error) {
    console.error(`ERROR: Error analyzing image for ${productTitle}:`, error);
    return null;
  }
}

/**
 * Parse Gemini's JSON response into structured analysis
 */
function parseGeminiAnalysis(text: string): Omit<ProductImageAnalysis, 'rawAnalysis'> | null {
  try {
    // Remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    jsonText = jsonText.trim();

    // Check if the response is plain text (error message from Gemini)
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
      console.error("ERROR: Gemini returned plain text instead of JSON:", jsonText.substring(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonText);

    // Validate that parsed result has expected structure
    if (typeof parsed !== 'object' || parsed === null) {
      console.error("ERROR: Gemini response is not a valid JSON object");
      return null;
    }

    return {
      detectedColors: Array.isArray(parsed.detectedColors) ? parsed.detectedColors : [],
      colorSeasons: Array.isArray(parsed.colorSeasons) ? parsed.colorSeasons : [],
      silhouetteType: parsed.silhouetteType || undefined,
      styleClassification: Array.isArray(parsed.styleClassification) ? parsed.styleClassification : [],
      fabricTexture: parsed.fabricTexture || undefined,
      designDetails: Array.isArray(parsed.designDetails) ? parsed.designDetails : [],
      patternType: parsed.patternType || undefined,
      additionalNotes: parsed.additionalNotes || undefined,
    };
  } catch (error) {
    console.error("ERROR: Error parsing Gemini analysis:", error);
    console.error("   Raw text:", text.substring(0, 500));
    return null;
  }
}

/**
 * Fetch all active products from Shopify Admin API
 */
export async function fetchShopifyProducts(shop: string): Promise<ShopifyProduct[]> {
  try {
    console.log(`INFO: Fetching products from Shopify for ${shop}...`);

    // Get access token from database
    const sessionRecord = await prisma.session.findFirst({
      where: { shop },
      orderBy: { id: 'desc' },
    });

    if (!sessionRecord || !sessionRecord.accessToken) {
      console.error('ERROR: No session/access token found for shop:', shop);
      return [];
    }

    const accessToken = sessionRecord.accessToken;

    // Fetch Online Store publication ID
    const publicationsQuery = `
      query {
        publications(first: 10) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const pubResponse = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: publicationsQuery }),
    });

    const pubData: any = await pubResponse.json();
    const onlineStore = pubData?.data?.publications?.edges?.find((edge: any) =>
      edge.node.name === 'Online Store'
    );

    const onlineStoreId = onlineStore?.node?.id;
    console.log(`INFO: Found Online Store publication ID: ${onlineStoreId}`);

    const allProducts: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = onlineStoreId
        ? `
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor, query: "status:active") {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                description
                productType
                tags
                totalInventory
                publishedAt
                publishedOnPublication: publishedOnPublication(publicationId: "${onlineStoreId}")
                variants(first: 10) {
                  edges {
                    node {
                      price
                      compareAtPrice
                      availableForSale
                      inventoryQuantity
                      displayName
                    }
                  }
                }
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `
        : `
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor, query: "status:active") {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                description
                productType
                tags
                totalInventory
                publishedAt
                variants(first: 10) {
                  edges {
                    node {
                      price
                      compareAtPrice
                      availableForSale
                      inventoryQuantity
                      displayName
                    }
                  }
                }
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { cursor },
        }),
      });

      if (!response.ok) {
        console.error(`ERROR: Admin API error: ${response.status} ${response.statusText}`);
        break;
      }

      const data: any = await response.json();

      if (data.errors) {
        console.error('ERROR: GraphQL errors:', data.errors);
        break;
      }

      const products = data?.data?.products?.edges || [];

      // Filter by Online Store publication
      const publishedProducts = onlineStoreId
        ? products.filter((edge: any) => edge.node.publishedOnPublication === true)
        : products;

      // Transform products
      const transformedProducts = publishedProducts.map((edge: any) => {
        const variants = edge.node.variants?.edges || [];
        const hasAvailableVariant = variants.some((v: any) => {
          return v.node.availableForSale === true || (v.node.inventoryQuantity || 0) > 0;
        });
        const hasTotalInventory = (edge.node.totalInventory || 0) > 0;
        const isAvailable = hasAvailableVariant || hasTotalInventory;

        // Extract available sizes from variants
        const availableSizes = variants
          .filter((v: any) => v.node.availableForSale === true || (v.node.inventoryQuantity || 0) > 0)
          .map((v: any) => v.node.displayName || v.node.title || '')
          .filter((title: string) => title);

        // Calculate total inventory quantity
        const totalInventory = edge.node.totalInventory || 0;

        // Check if on sale (has compareAtPrice > price)
        const firstVariant = variants?.[0]?.node;
        const price = firstVariant?.price || '';
        const compareAtPrice = firstVariant?.compareAtPrice || '';

        return {
          id: edge.node.id,
          title: edge.node.title,
          handle: edge.node.handle,
          description: edge.node.description || '',
          productType: edge.node.productType || '',
          tags: edge.node.tags || [],
          price,
          compareAtPrice,
          imageUrl: edge.node.featuredImage?.url || '',
          variants: variants.map((v: any) => ({
            price: v.node.price,
            compareAtPrice: v.node.compareAtPrice,
            available: v.node.availableForSale === true || (v.node.inventoryQuantity || 0) > 0
          })),
          inStock: isAvailable,
          availableSizes,
          inventoryQuantity: totalInventory,
          publishedAt: edge.node.publishedAt ? new Date(edge.node.publishedAt) : undefined,
        };
      });

      allProducts.push(...transformedProducts);

      hasNextPage = data?.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data?.data?.products?.pageInfo?.endCursor || null;

      console.log(`INFO: Fetched ${transformedProducts.length} products (total: ${allProducts.length})`);
    }

    console.log(`INFO: Total products fetched: ${allProducts.length}`);
    return allProducts;
  } catch (error) {
    console.error('ERROR: Error fetching products from Shopify:', error);
    return [];
  }
}

/**
 * Calculate priority score for caching during product save
 * Uses current priority settings to pre-calculate score
 */
async function calculateAndCachePriorityScore(
  shop: string,
  productData: {
    price: number;
    compareAtPrice: number | null;
    inventoryQuantity: number | null;
    publishedAt: Date | null;
    totalSold: number | null;
    profitMargin: number | null;
  }
): Promise<{ priorityScore: number; priorityCalculatedAt: Date }> {
  try {
    // Load priority settings
    let settings = await db.recommendationPrioritySettings.findUnique({
      where: { shop },
    });

    // Use defaults if not found
    if (!settings) {
      settings = {
        id: '',
        shop,
        strategy: 'balanced',
        newArrivalBoost: 50,
        lowInventoryBoost: 50,
        lowSalesBoost: 50,
        highMarginBoost: 50,
        onSaleBoost: 50,
        newArrivalDays: 30,
        lowInventoryThreshold: 10,
        lowSalesThreshold: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    let score = 0;
    const now = new Date();

    // New Arrival Score
    if (productData.publishedAt && settings.newArrivalBoost > 0) {
      const daysSincePublished = Math.floor(
        (now.getTime() - productData.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSincePublished <= settings.newArrivalDays) {
        const freshnessFactor = 1 - (daysSincePublished / settings.newArrivalDays);
        score += freshnessFactor * settings.newArrivalBoost;
      }
    }

    // Overstocked Score
    if (productData.inventoryQuantity != null && settings.lowInventoryBoost > 0) {
      if (productData.inventoryQuantity > settings.lowInventoryThreshold) {
        const overstockFactor = Math.min(
          productData.inventoryQuantity / (settings.lowInventoryThreshold * 3),
          1
        );
        score += overstockFactor * settings.lowInventoryBoost;
      }
    }

    // Slow-Moving Score
    if (productData.totalSold != null && settings.lowSalesBoost > 0) {
      if (productData.totalSold < settings.lowSalesThreshold) {
        const slowMovingFactor = 1 - (productData.totalSold / settings.lowSalesThreshold);
        score += slowMovingFactor * settings.lowSalesBoost;
      }
    }

    // High Margin Score
    if (productData.profitMargin != null && settings.highMarginBoost > 0) {
      const marginFactor = Math.min(productData.profitMargin / 100, 1);
      score += marginFactor * settings.highMarginBoost;
    }

    // On Sale Score
    if (settings.onSaleBoost > 0) {
      const isOnSale = productData.compareAtPrice != null &&
                       productData.compareAtPrice > 0 &&
                       productData.compareAtPrice > productData.price;
      if (isOnSale) {
        score += settings.onSaleBoost;
      }
    }

    return {
      priorityScore: score,
      priorityCalculatedAt: now,
    };
  } catch (error) {
    console.error('Error calculating priority score:', error);
    return {
      priorityScore: 0,
      priorityCalculatedAt: new Date(),
    };
  }
}

/**
 * Save product without image analysis to database (FilteredSelection)
 * Stores RAW Shopify data + CACHED priority score (hybrid approach)
 */
export async function saveBasicProduct(
  shop: string,
  product: ShopifyProduct
): Promise<boolean> {
  try {
    const price = parseFloat(product.price) || 0;
    const compareAtPrice = parseFloat(product.compareAtPrice || '0') || 0;

    // Calculate and cache priority score
    const cachedPriority = await calculateAndCachePriorityScore(shop, {
      price,
      compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
      inventoryQuantity: product.inventoryQuantity || 0,
      publishedAt: product.publishedAt || null,
      totalSold: null, // Not available from Shopify
      profitMargin: null, // Not available from Shopify
    });

    await db.filteredSelection.upsert({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: product.id,
        },
      },
      update: {
        title: product.title,
        handle: product.handle,
        description: product.description,
        productType: product.productType,
        tags: product.tags || [],
        price,
        imageUrl: product.imageUrl,
        variants: product.variants || [],
        inStock: product.inStock || false,
        availableSizes: product.availableSizes || [],
        categories: [product.productType || 'general'],
        lastUpdated: new Date(),
        // Raw Shopify business data
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
        // Cached priority score (for performance)
        priorityScore: cachedPriority.priorityScore,
        priorityCalculatedAt: cachedPriority.priorityCalculatedAt,
      },
      create: {
        shop,
        shopifyProductId: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        productType: product.productType,
        tags: product.tags || [],
        price,
        imageUrl: product.imageUrl,
        variants: product.variants || [],
        inStock: product.inStock || false,
        availableSizes: product.availableSizes || [],
        categories: [product.productType || 'general'],
        // Raw Shopify business data
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
        // Cached priority score (for performance)
        priorityScore: cachedPriority.priorityScore,
        priorityCalculatedAt: cachedPriority.priorityCalculatedAt,
      },
    });

    return true;
  } catch (error) {
    console.error(`ERROR: Error saving basic product ${product.title}:`, error);
    return false;
  }
}

/**
 * Save analyzed product to database (FilteredSelectionWithImgAnalyzed)
 * Stores RAW Shopify data + Gemini analysis + CACHED priority score (hybrid approach)
 */
export async function saveAnalyzedProduct(
  shop: string,
  product: ShopifyProduct,
  analysis: ProductImageAnalysis
): Promise<boolean> {
  try {
    const price = parseFloat(product.price) || 0;
    const compareAtPrice = parseFloat(product.compareAtPrice || '0') || 0;

    // Calculate and cache priority score
    const cachedPriority = await calculateAndCachePriorityScore(shop, {
      price,
      compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
      inventoryQuantity: product.inventoryQuantity || 0,
      publishedAt: product.publishedAt || null,
      totalSold: null, // Not available from Shopify
      profitMargin: null, // Not available from Shopify
    });

    // Note: totalSold and profitMargin are not available from Shopify GraphQL API
    // They would require additional queries or integrations
    // For now, we'll set them to null and they can be manually updated or fetched separately

    await db.filteredSelectionWithImgAnalyzed.upsert({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: product.id,
        },
      },
      update: {
        title: product.title,
        handle: product.handle,
        description: product.description,
        productType: product.productType,
        tags: product.tags || [],
        price,
        imageUrl: product.imageUrl,
        variants: product.variants || [],
        inStock: product.inStock || false,
        availableSizes: product.availableSizes || [],
        categories: [product.productType || 'general'],
        geminiAnalysis: analysis.rawAnalysis,
        detectedColors: analysis.detectedColors,
        colorSeasons: analysis.colorSeasons,
        silhouetteType: analysis.silhouetteType,
        styleClassification: analysis.styleClassification,
        fabricTexture: analysis.fabricTexture,
        designDetails: analysis.designDetails,
        patternType: analysis.patternType,
        additionalNotes: analysis.additionalNotes,
        geminiModelVersion: "gemini-2.0-flash-exp",
        lastUpdated: new Date(),
        // Raw Shopify business data
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
        // Cached priority score (for performance)
        priorityScore: cachedPriority.priorityScore,
        priorityCalculatedAt: cachedPriority.priorityCalculatedAt,
      },
      create: {
        shop,
        shopifyProductId: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        productType: product.productType,
        tags: product.tags || [],
        price,
        imageUrl: product.imageUrl,
        variants: product.variants || [],
        inStock: product.inStock || false,
        availableSizes: product.availableSizes || [],
        categories: [product.productType || 'general'],
        geminiAnalysis: analysis.rawAnalysis,
        detectedColors: analysis.detectedColors,
        colorSeasons: analysis.colorSeasons,
        silhouetteType: analysis.silhouetteType,
        styleClassification: analysis.styleClassification,
        fabricTexture: analysis.fabricTexture,
        designDetails: analysis.designDetails,
        patternType: analysis.patternType,
        additionalNotes: analysis.additionalNotes,
        geminiModelVersion: "gemini-2.0-flash-exp",
        // Raw Shopify business data
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
        // Cached priority score (for performance)
        priorityScore: cachedPriority.priorityScore,
        priorityCalculatedAt: cachedPriority.priorityCalculatedAt,
      },
    });

    return true;
  } catch (error) {
    console.error(`ERROR: Error saving analyzed product ${product.title}:`, error);
    return false;
  }
}

/**
 * Log refresh activity to database
 */
export async function logRefreshActivity(
  shop: string,
  refreshType: string,
  productsFetched: number,
  productsAnalyzed: number,
  geminiApiCalls: number,
  totalCostUsd: number,
  status: string,
  startedAt: Date,
  errorMessage?: string
): Promise<void> {
  try {
    await db.productRefreshLog.create({
      data: {
        shop,
        refreshType,
        startedAt,
        completedAt: new Date(),
        status,
        productsFetched,
        productsAnalyzed,
        geminiApiCalls,
        openaiApiCalls: 0, // Not used in Gemini-only architecture
        totalCostUsd,
        errorMessage,
      },
    });
  } catch (error) {
    console.error("ERROR: Error logging refresh activity:", error);
  }
}
