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
        systemPrompt: settings.systemPrompt || DEFAULT_GEMINI_SYSTEM_PROMPT,
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
      systemPrompt: DEFAULT_GEMINI_SYSTEM_PROMPT,
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
      systemPrompt: DEFAULT_GEMINI_SYSTEM_PROMPT,
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
    console.log("Saving Gemini settings:", {
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

    console.log("✅ Gemini settings saved successfully for shop:", shop);
    return true;
  } catch (error) {
    console.error("Error saving Gemini settings:", error);
    return false;
  }
}

/**
 * Analyze a single product image using Gemini
 */
export async function analyzeProductImage(
  imageUrl: string,
  shop: string,
  productTitle: string
): Promise<ProductImageAnalysis | null> {
  try {
    // Load settings
    const settings = await loadGeminiSettings(shop);

    if (!settings.enabled) {
      console.log(`⏭ Gemini image analysis disabled for ${shop}`);
      return null;
    }

    // Get API key
    const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ No Gemini API key configured");
      return null;
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: settings.model });

    console.log(`🖼️  Analyzing image for: ${productTitle}`);

    // Fetch image as base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`❌ Failed to fetch image: ${imageResponse.statusText}`);
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

    // Call Gemini with image and enforce JSON output
    const result = await model.generateContent({
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
    });

    const response = await result.response;
    const text = response.text();

    console.log(`✅ Gemini response received (${text.length} chars)`);

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
      console.error("❌ Failed to parse Gemini analysis");
      return null;
    }

    // Parse the cleaned text for rawAnalysis
    let rawAnalysis;
    try {
      rawAnalysis = JSON.parse(cleanedText);
    } catch (error) {
      console.error("❌ Failed to parse raw analysis:", error);
      console.error("   Cleaned text:", cleanedText.substring(0, 500));
      rawAnalysis = null;
    }

    return {
      ...analysis,
      rawAnalysis,
    };
  } catch (error) {
    console.error(`❌ Error analyzing image for ${productTitle}:`, error);
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
      console.error("❌ Gemini returned plain text instead of JSON:", jsonText.substring(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonText);

    // Validate that parsed result has expected structure
    if (typeof parsed !== 'object' || parsed === null) {
      console.error("❌ Gemini response is not a valid JSON object");
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
    console.error("❌ Error parsing Gemini analysis:", error);
    console.error("   Raw text:", text.substring(0, 500));
    return null;
  }
}

/**
 * Fetch all active products from Shopify Admin API
 */
export async function fetchShopifyProducts(shop: string): Promise<ShopifyProduct[]> {
  try {
    console.log(`🔄 Fetching products from Shopify for ${shop}...`);

    // Get access token from database
    const sessionRecord = await prisma.session.findFirst({
      where: { shop },
      orderBy: { id: 'desc' },
    });

    if (!sessionRecord || !sessionRecord.accessToken) {
      console.error('❌ No session/access token found for shop:', shop);
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
    console.log(`✓ Found Online Store publication ID: ${onlineStoreId}`);

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
        console.error(`❌ Admin API error: ${response.status} ${response.statusText}`);
        break;
      }

      const data: any = await response.json();

      if (data.errors) {
        console.error('❌ GraphQL errors:', data.errors);
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

      console.log(`✓ Fetched ${transformedProducts.length} products (total: ${allProducts.length})`);
    }

    console.log(`✅ Total products fetched: ${allProducts.length}`);
    return allProducts;
  } catch (error) {
    console.error('❌ Error fetching products from Shopify:', error);
    return [];
  }
}

/**
 * Save product without image analysis to database (FilteredSelection)
 * Stores RAW Shopify data only - business analysis happens at request time
 */
export async function saveBasicProduct(
  shop: string,
  product: ShopifyProduct
): Promise<boolean> {
  try {
    const price = parseFloat(product.price) || 0;
    const compareAtPrice = parseFloat(product.compareAtPrice || '0') || 0;

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
        // Raw Shopify business data (NO calculations)
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
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
        // Raw Shopify business data (NO calculations)
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
      },
    });

    return true;
  } catch (error) {
    console.error(`❌ Error saving basic product ${product.title}:`, error);
    return false;
  }
}

/**
 * Save analyzed product to database (FilteredSelectionWithImgAnalyzed)
 * Stores RAW Shopify data + Gemini analysis - business analysis happens at request time
 */
export async function saveAnalyzedProduct(
  shop: string,
  product: ShopifyProduct,
  analysis: ProductImageAnalysis
): Promise<boolean> {
  try {
    const price = parseFloat(product.price) || 0;
    const compareAtPrice = parseFloat(product.compareAtPrice || '0') || 0;

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
        // Raw Shopify business data (NO calculations)
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
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
        // Raw Shopify business data (NO calculations)
        inventoryQuantity: product.inventoryQuantity || 0,
        compareAtPrice: compareAtPrice > 0 ? compareAtPrice : null,
        publishedAt: product.publishedAt || null,
      },
    });

    return true;
  } catch (error) {
    console.error(`❌ Error saving analyzed product ${product.title}:`, error);
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
  errorMessage?: string
): Promise<void> {
  try {
    await db.productRefreshLog.create({
      data: {
        shop,
        refreshType,
        startedAt: new Date(),
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
    console.error("❌ Error logging refresh activity:", error);
  }
}
