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
}

export interface ProductImageAnalysis {
  detectedColors: string[];
  colorSeasons: string[];
  silhouetteType?: string;
  styleClassification: string[];
  fabricTexture?: string;
  designDetails: string[];
  patternType?: string;
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
}

// Default prompt for Gemini image analysis
export const DEFAULT_GEMINI_SYSTEM_PROMPT = `You are an expert fashion analyst with deep knowledge of:
- Color theory and seasonal color analysis (Spring, Summer, Autumn, Winter)
- Clothing silhouettes and fit types
- Fabric textures and materials
- Fashion design details and styling elements
- Pattern types and print styles

Your task is to analyze clothing product images with precision and consistency.`;

export const DEFAULT_GEMINI_IMAGE_PROMPT = `Analyze this clothing product image and provide detailed visual analysis in JSON format.

Extract the following information:

1. **detectedColors**: Array of primary colors visible in the garment (max 5 colors, use common color names)
2. **colorSeasons**: Which seasonal color palettes does this suit? Array from: ["Spring", "Summer", "Autumn", "Winter"]
3. **silhouetteType**: The overall silhouette (e.g., "A-line", "Fitted", "Oversized", "Straight", "Wrap", "Empire")
4. **styleClassification**: Style categories (e.g., ["Casual", "Formal", "Bohemian", "Minimalist", "Sporty"])
5. **fabricTexture**: Apparent fabric type (e.g., "Smooth silk", "Textured knit", "Denim", "Flowing chiffon")
6. **designDetails**: Notable design elements (e.g., ["V-neckline", "Puff sleeves", "Side pockets", "Pleated skirt"])
7. **patternType**: Pattern classification (e.g., "Solid", "Striped", "Floral", "Geometric", "Polka dot")

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "detectedColors": ["color1", "color2"],
  "colorSeasons": ["Spring", "Summer"],
  "silhouetteType": "A-line",
  "styleClassification": ["Casual", "Bohemian"],
  "fabricTexture": "Flowing cotton",
  "designDetails": ["V-neckline", "Short sleeves"],
  "patternType": "Floral"
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
        enabled: settings.enabled,
      };
    }

    // Return defaults if no settings found
    return {
      apiKey: undefined,
      model: "gemini-2.0-flash-exp",
      prompt: DEFAULT_GEMINI_IMAGE_PROMPT,
      enabled: true,
    };
  } catch (error) {
    console.error("Error loading Gemini settings:", error);
    return {
      apiKey: undefined,
      model: "gemini-2.0-flash-exp",
      prompt: DEFAULT_GEMINI_IMAGE_PROMPT,
      enabled: true,
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
    await db.geminiSettings.upsert({
      where: { shop },
      update: {
        apiKey: settings.apiKey,
        model: settings.model,
        prompt: settings.prompt,
        enabled: settings.enabled,
        updatedAt: new Date(),
      },
      create: {
        shop,
        apiKey: settings.apiKey,
        model: settings.model,
        prompt: settings.prompt,
        enabled: settings.enabled,
      },
    });

    console.log("Gemini settings saved successfully for shop:", shop);
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

    // Build prompt with system instructions
    const fullPrompt = `${DEFAULT_GEMINI_SYSTEM_PROMPT}

${settings.prompt}

Product Title: ${productTitle}`;

    // Call Gemini with image
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
      fullPrompt,
    ]);

    const response = await result.response;
    const text = response.text();

    console.log(`✅ Gemini response received (${text.length} chars)`);

    // Parse JSON response
    const analysis = parseGeminiAnalysis(text);

    if (!analysis) {
      console.error("❌ Failed to parse Gemini analysis");
      return null;
    }

    return {
      ...analysis,
      rawAnalysis: JSON.parse(text),
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

    const parsed = JSON.parse(jsonText);

    return {
      detectedColors: parsed.detectedColors || [],
      colorSeasons: parsed.colorSeasons || [],
      silhouetteType: parsed.silhouetteType || undefined,
      styleClassification: parsed.styleClassification || [],
      fabricTexture: parsed.fabricTexture || undefined,
      designDetails: parsed.designDetails || [],
      patternType: parsed.patternType || undefined,
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
                publishedOnPublication: publishedOnPublication(publicationId: "${onlineStoreId}")
                variants(first: 10) {
                  edges {
                    node {
                      price
                      availableForSale
                      inventoryQuantity
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
                variants(first: 10) {
                  edges {
                    node {
                      price
                      availableForSale
                      inventoryQuantity
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
          .map((v: any) => v.node.title || '')
          .filter((title: string) => title);

        return {
          id: edge.node.id,
          title: edge.node.title,
          handle: edge.node.handle,
          description: edge.node.description || '',
          productType: edge.node.productType || '',
          tags: edge.node.tags || [],
          price: variants?.[0]?.node?.price || '',
          imageUrl: edge.node.featuredImage?.url || '',
          variants: variants.map((v: any) => ({
            price: v.node.price,
            available: v.node.availableForSale === true || (v.node.inventoryQuantity || 0) > 0
          })),
          inStock: isAvailable,
          availableSizes,
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
 * Save analyzed product to database (FilteredSelectionWithImgAnalyzed)
 */
export async function saveAnalyzedProduct(
  shop: string,
  product: ShopifyProduct,
  analysis: ProductImageAnalysis
): Promise<boolean> {
  try {
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
        price: parseFloat(product.price) || 0,
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
        geminiModelVersion: "gemini-2.0-flash-exp",
        lastUpdated: new Date(),
      },
      create: {
        shop,
        shopifyProductId: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        productType: product.productType,
        tags: product.tags || [],
        price: parseFloat(product.price) || 0,
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
        geminiModelVersion: "gemini-2.0-flash-exp",
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
