import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db.server";
import { loadSettings } from "./settings";
import prisma from "../db.server";

// Product interface matching both MCP and Admin API
export interface Product {
  id?: string;
  title: string;
  name?: string;
  handle?: string;
  description?: string;
  productType?: string;
  tags?: string[];
  price?: string;
  image?: string;
  imageUrl?: string;
  available?: boolean;
  variants?: Array<{ price: string; available?: boolean }>;
}

export interface ProductRecommendation {
  product: Product;
  suitabilityScore: number;
  recommendedSize?: string;
  reasoning: string;
  category: string;
  stylingTip?: string;
}

// Default prompts that can be customized by admin
export const DEFAULT_SYSTEM_PROMPT = `You are an expert fashion stylist and personal shopper with deep knowledge of body proportions and style optimization. Your goal is to select products that will genuinely flatter the customer's body shape.

You analyze clothing based on:
- Silhouette and how it interacts with different body shapes
- Fabric, drape, and structure
- Necklines, waistlines, and hem styles
- Color and pattern placement
- Fit and proportion principles

You provide honest, specific recommendations that help customers look and feel their best.`;

export const DEFAULT_RECOMMENDATION_PROMPT = `Analyze the provided products and select the most suitable items for the customer's body shape.

For each recommendation, consider:
1. How the garment's silhouette flatters their specific body shape
2. Whether the fit and proportions complement their measurements
3. How design elements (necklines, waistlines, etc.) enhance their figure
4. Practical styling advice for wearing the item

Provide specific, actionable reasoning for each recommendation.`;

export interface ClaudePromptSettings {
  apiKey?: string;
  systemPrompt: string;
  recommendationPrompt: string;
  enabled: boolean;
  temperature: number;
  maxTokens: number;
}

/**
 * Load Claude prompt settings from database for a specific shop
 */
export async function loadClaudeSettings(shop: string): Promise<ClaudePromptSettings> {
  try {
    const settings = await db.claudePromptSettings.findUnique({
      where: { shop },
    });

    if (settings) {
      return {
        apiKey: settings.apiKey || undefined,
        systemPrompt: settings.systemPrompt,
        recommendationPrompt: settings.recommendationPrompt,
        enabled: settings.enabled,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      };
    }

    // Return defaults if no settings found
    return {
      apiKey: undefined,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      recommendationPrompt: DEFAULT_RECOMMENDATION_PROMPT,
      enabled: true,
      temperature: 0.7,
      maxTokens: 32000, // Increased to avoid truncation with large catalogs
    };
  } catch (error) {
    console.error("Error loading Claude settings:", error);
    return {
      apiKey: undefined,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      recommendationPrompt: DEFAULT_RECOMMENDATION_PROMPT,
      enabled: true,
      temperature: 0.7,
      maxTokens: 16384, // Increased for longer responses
    };
  }
}

/**
 * Save Claude prompt settings to database
 */
export async function saveClaudeSettings(
  shop: string,
  settings: ClaudePromptSettings
): Promise<boolean> {
  try {
    await db.claudePromptSettings.upsert({
      where: { shop },
      update: {
        apiKey: settings.apiKey,
        systemPrompt: settings.systemPrompt,
        recommendationPrompt: settings.recommendationPrompt,
        enabled: settings.enabled,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        updatedAt: new Date(),
      },
      create: {
        shop,
        apiKey: settings.apiKey,
        systemPrompt: settings.systemPrompt,
        recommendationPrompt: settings.recommendationPrompt,
        enabled: settings.enabled,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      },
    });

    console.log("Claude settings saved successfully for shop:", shop);
    return true;
  } catch (error) {
    console.error("Error saving Claude settings:", error);
    return false;
  }
}

/**
 * Fetch all products using Shopify Admin API
 */
async function fetchAllProductsAdminAPI(shop: string): Promise<Product[]> {
  try {
    console.log(`🔄 Fetching products via Admin API for ${shop}...`);

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

    // First, fetch the Online Store publication ID
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

    const allProducts: Product[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      // Build query with or without publication filter
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
                status
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
                status
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

      const response: Response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
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

      // Filter by Online Store publication (only if we have the publication ID)
      const publishedProducts = onlineStoreId
        ? products.filter((edge: any) => {
            // Only include products published to Online Store
            const isPublishedOnlineStore = edge.node.publishedOnPublication === true;
            return isPublishedOnlineStore;
          })
        : products; // If no publication ID, use all active products

      if (onlineStoreId) {
        console.log(`✓ Online Store filter: ${products.length} → ${publishedProducts.length} published products`);
      } else {
        console.log(`ℹ No Online Store publication ID found, using all active products: ${products.length}`);
      }

      // Transform products to unified format
      const transformedProducts = publishedProducts.map((edge: any) => {
          const variants = edge.node.variants?.edges || [];

          // Check if ANY variant is available using multiple methods for reliability
          const hasAvailableVariant = variants.some((v: any) => {
            const availableForSale = v.node.availableForSale === true;
            const hasInventory = (v.node.inventoryQuantity || 0) > 0;
            return availableForSale || hasInventory;
          });

          // Also check totalInventory at product level as fallback
          const hasTotalInventory = (edge.node.totalInventory || 0) > 0;

          // Product is available if either condition is true
          const isAvailable = hasAvailableVariant || hasTotalInventory;

          return {
            id: edge.node.id,
            title: edge.node.title,
            name: edge.node.title, // Alias for compatibility
            handle: edge.node.handle,
            description: edge.node.description || '',
            productType: edge.node.productType || '',
            tags: edge.node.tags || '',
            price: variants?.[0]?.node?.price || '',
            image: edge.node.featuredImage?.url || '',
            imageUrl: edge.node.featuredImage?.url || '', // Alias
            available: isAvailable,
            variants: variants.map((v: any) => ({
              price: v.node.price,
              available: v.node.availableForSale === true || (v.node.inventoryQuantity || 0) > 0
            }))
          };
        });

      allProducts.push(...transformedProducts);

      hasNextPage = data?.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data?.data?.products?.pageInfo?.endCursor || null;

      console.log(`✓ Fetched ${transformedProducts.length} products (total: ${allProducts.length}, hasNextPage: ${hasNextPage})`);

      // Debug: Log first product's inventory data on first fetch
      if (allProducts.length === transformedProducts.length && transformedProducts.length > 0) {
        const firstProduct = transformedProducts[0];
        const firstEdge = products[0];
        console.log(`🔍 First product inventory debug:`, {
          title: firstProduct.title,
          available: firstProduct.available,
          totalInventory: firstEdge?.node?.totalInventory,
          variantsCount: firstProduct.variants?.length,
          firstVariant: {
            availableForSale: firstEdge?.node?.variants?.edges?.[0]?.node?.availableForSale,
            inventoryQuantity: firstEdge?.node?.variants?.edges?.[0]?.node?.inventoryQuantity
          }
        });
      }
    }

    console.log(`✅ Total products fetched via Admin API: ${allProducts.length}`);
    return allProducts;
  } catch (error) {
    console.error('❌ Error fetching products from Admin API:', error);
    return [];
  }
}

/**
 * Get product recommendations using Claude AI with Shopify Admin API
 */
export async function getClaudeProductRecommendations(
  storeDomain: string,
  shop: string,
  bodyShape: string,
  measurements?: {
    gender: string;
    age: string;
    bust: number;
    waist: number;
    hips: number;
    shoulders: number;
  },
  numberOfSuggestions: number = 30,
  minimumMatchScore: number = 30,
  maxProductsToScan: number = 0,
  onlyInStock: boolean = false,
  colorSeason?: string,
  enableImageAnalysis: boolean = false
): Promise<ProductRecommendation[]> {
  try {
    // Load Claude settings for this shop
    const claudeSettings = await loadClaudeSettings(shop);

    // Fetch ALL products from Shopify Admin API (filtered by Online Store publication)
    console.log(`🔄 Fetching products via Admin API for ${shop}...`);
    let products = await fetchAllProductsAdminAPI(shop);

    if (products.length === 0) {
      console.log("No products found in store published to Online Store");
      return [];
    }

    console.log(`✓ Fetched ${products.length} products published to Online Store`);

    // Apply max products to scan limit (0 = scan all)
    if (maxProductsToScan > 0 && products.length > maxProductsToScan) {
      console.log(`✓ Limiting scan to first ${maxProductsToScan} products (from ${products.length})`);
      products = products.slice(0, maxProductsToScan);
    }

    // STEP 1: Filter by stock availability (if enabled)
    const stockFilteredProducts = onlyInStock
      ? products.filter(product => {
          return product.variants && product.variants.some(v => v.available === true);
        })
      : products;

    console.log(`✓ Stock filter: ${products.length} → ${stockFilteredProducts.length} ${onlyInStock ? 'in-stock' : 'all'} products`);

    // Debug: Log sample product availability data
    if (onlyInStock && products.length > 0) {
      const sampleProduct = products[0];
      console.log(`📦 Sample product availability check:`, {
        title: sampleProduct.title,
        available: sampleProduct.available,
        variantCount: sampleProduct.variants?.length || 0,
        firstVariantAvailable: sampleProduct.variants?.[0]?.available
      });
    }

    // STEP 2: Optional pre-filter - Remove obvious mismatches (disabled for small catalogs)
    // For catalogs under 5000 products, skip pre-filtering and let Claude do all the work
    let preFilteredProducts = stockFilteredProducts;

    if (stockFilteredProducts.length > 5000) {
      preFilteredProducts = preFilterProducts(stockFilteredProducts, bodyShape);
      console.log(`✓ Pre-filter (avoid keywords): ${stockFilteredProducts.length} → ${preFilteredProducts.length} relevant products for ${bodyShape}`);
    } else {
      console.log(`ℹ Skipping pre-filter (catalog size: ${stockFilteredProducts.length} < 5000 threshold)`);
    }

    // Check if we have products to recommend
    if (preFilteredProducts.length === 0) {
      console.log("No products found after filtering");
      return [];
    }

    // If Claude is disabled, fall back to algorithmic recommendations
    if (!claudeSettings.enabled) {
      console.log("⚠ Claude AI is disabled, using fallback algorithm on pre-filtered products");
      return applyBasicAlgorithm(preFilteredProducts, bodyShape, numberOfSuggestions, minimumMatchScore, measurements);
    }

    // IMPORTANT: Limit products sent to Claude to avoid token limits
    // Strategy: Smart sampling to get diverse product mix
    // - For small catalogs (<500): send all products
    // - For large catalogs: sample strategically across categories
    // - With image analysis: limit to 100 products (Claude's image limit)
    const MAX_PRODUCTS_FOR_CLAUDE = enableImageAnalysis ? 100 : 500;
    let productsForClaude = preFilteredProducts;

    if (productsForClaude.length > MAX_PRODUCTS_FOR_CLAUDE) {
      console.log(`⚠ Large catalog detected: ${productsForClaude.length} products`);
      console.log(`   Sampling ${MAX_PRODUCTS_FOR_CLAUDE} products strategically...`);

      // Group by product type for diverse sampling
      const byType = new Map<string, Product[]>();
      preFilteredProducts.forEach(p => {
        const type = p.productType || 'Other';
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type)!.push(p);
      });

      // Calculate how many products per category
      const perCategory = Math.ceil(MAX_PRODUCTS_FOR_CLAUDE / byType.size);
      productsForClaude = [];

      byType.forEach((products, type) => {
        const sample = products.slice(0, perCategory);
        productsForClaude.push(...sample);
        console.log(`   - ${type}: ${sample.length}/${products.length}`);
      });

      // If we didn't reach the limit, fill with remaining products
      if (productsForClaude.length < MAX_PRODUCTS_FOR_CLAUDE) {
        const remaining = preFilteredProducts
          .filter(p => !productsForClaude.includes(p))
          .slice(0, MAX_PRODUCTS_FOR_CLAUDE - productsForClaude.length);
        productsForClaude.push(...remaining);
      }

      productsForClaude = productsForClaude.slice(0, MAX_PRODUCTS_FOR_CLAUDE);
      console.log(`✓ Sampled ${productsForClaude.length} products across categories`);
    }

    // STEP 3: Prepare product data for Claude AI
    const productsForAI = productsForClaude.map((p, index) => ({
      index,
      title: p.title || p.name || 'Untitled Product',
      description: (p.description || '').substring(0, 300),
      productType: p.productType || '',
      tags: (p.tags || []).join(", "),
      price: p.variants?.[0]?.price || p.price || "N/A",
      imageUrl: enableImageAnalysis ? (p.imageUrl || p.image) : undefined
    }));

    console.log(`✓ Prepared ${productsForAI.length} products for Claude AI analysis`);
    if (enableImageAnalysis) {
      console.log(`🖼️  Image analysis enabled - Claude will analyze product images`);
    }

    // Build the prompt for Claude
    const prompt = buildClaudePrompt(
      bodyShape,
      measurements,
      productsForAI,
      numberOfSuggestions,
      minimumMatchScore,
      claudeSettings.recommendationPrompt,
      colorSeason,
      enableImageAnalysis
    );

    // STEP 4: Check API key and call Claude
    const apiKey = claudeSettings.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error("⚠ No Anthropic API key configured, falling back to basic algorithm");
      console.error(`   - claudeSettings.apiKey: ${claudeSettings.apiKey ? 'SET' : 'NOT SET'}`);
      console.error(`   - process.env.ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
      return applyBasicAlgorithm(preFilteredProducts, bodyShape, numberOfSuggestions, minimumMatchScore, measurements);
    }

    console.log(`✓ API key found: ${apiKey.substring(0, 10)}...`);

    // Create Anthropic client with the appropriate API key
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    console.log(`🤖 Calling Claude AI (model: claude-sonnet-4, temp: ${claudeSettings.temperature}, max_tokens: ${claudeSettings.maxTokens})...`);
    console.log(`   Sending ${productsForAI.length} products to Claude for analysis`);

    if (claudeSettings.maxTokens < 16384) {
      console.warn(`⚠ WARNING: maxTokens is low (${claudeSettings.maxTokens}). Recommended: 32000 for best results.`);
      console.warn(`   Low maxTokens may cause response truncation. Update in Admin Settings > Claude AI.`);
    }

    // Build content array for Claude API
    // If image analysis is enabled and images are available, use multi-modal content
    let messageContent: any;

    if (enableImageAnalysis) {
      // NOTE: Image analysis is currently disabled due to Claude API limitations
      // Product images from Shopify CDN often exceed 2000x2000px, which causes:
      // "At least one of the image dimensions exceed max allowed size for many-image requests: 2000 pixels"
      //
      // To re-enable image analysis, images would need to be resized/validated before sending
      console.log(`   ℹ️ Image analysis disabled - using text-only analysis to avoid dimension errors`);
      console.log(`   Product images often exceed Claude's 2000x2000px limit for multi-image requests`);
      messageContent = prompt;
    } else {
      // Text-only mode (no image analysis)
      messageContent = prompt;
    }

    // Call Claude API
    console.log(`📤 Sending request to Claude API...`);
    const startTime = Date.now();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: claudeSettings.maxTokens,
      temperature: claudeSettings.temperature,
      system: claudeSettings.systemPrompt,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ]
    });

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Claude API responded in ${elapsedTime}s`);

    // STEP 5: Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log(`📝 Claude response length: ${responseText.length} chars`);
    console.log(`📝 Claude stop_reason: ${message.stop_reason}`);
    console.log(`📝 Claude model used: ${message.model}`);
    console.log(`📝 Claude usage: input_tokens=${message.usage.input_tokens}, output_tokens=${message.usage.output_tokens}`);
    console.log(`📝 Claude response (first 500 chars): ${responseText.substring(0, 500)}`);
    console.log(`📝 Claude response (last 500 chars): ${responseText.slice(-500)}`);

    if (message.stop_reason === 'max_tokens') {
      console.error(`❌ CRITICAL: Claude hit max_tokens limit! Response is TRUNCATED.`);
      console.error(`   Current maxTokens: ${claudeSettings.maxTokens}`);
      console.error(`   Recommendation: Increase to 32000 in Claude AI Settings`);
      console.error(`   This will cause JSON parsing to fail and fall back to basic algorithm!`);
    }

    console.log(`🔄 Parsing Claude response...`);
    const recommendations = parseClaudeResponse(responseText, productsForClaude, minimumMatchScore);

    if (recommendations.length === 0) {
      console.error(`❌ CRITICAL: Claude returned 0 recommendations after parsing!`);
      console.error(`   This will trigger fallback to basic algorithm`);
      console.error(`   Check parseClaudeResponse logs above for parsing errors`);
      console.error(`   Possible causes:`);
      console.error(`     1. All products scored below minimumMatchScore (${minimumMatchScore})`);
      console.error(`     2. Claude's response was truncated (check stop_reason above)`);
      console.error(`     3. JSON parsing failed (check parse errors above)`);
      console.error(`     4. Products array was empty or invalid`);
      console.error(`   Number of products sent to Claude: ${productsForClaude.length}`);
    } else {
      console.log(`✅ Claude AI returned ${recommendations.length} recommendations after parsing`);
    }

    console.log(`📊 Slicing to numberOfSuggestions=${numberOfSuggestions} (from ${recommendations.length} total)`);

    const finalRecommendations = recommendations.slice(0, numberOfSuggestions);
    console.log(`✅ Returning ${finalRecommendations.length} final recommendations`);

    // Log first recommendation as sample
    if (finalRecommendations.length > 0) {
      const sample = finalRecommendations[0];
      console.log(`📦 Sample recommendation:`, {
        title: sample.product.title,
        score: Math.round(sample.suitabilityScore * 100),
        reasoning: sample.reasoning?.substring(0, 100) + '...',
        stylingTip: sample.stylingTip ? 'Present' : 'Missing'
      });
    }

    return finalRecommendations;
  } catch (error) {
    console.error("❌ Error getting Claude recommendations:", error);
    // Fallback to basic algorithm if Claude fails
    try {
      console.log("⚠ Attempting fallback to basic algorithm...");
      // Try to get pre-filtered products if available
      const products = await fetchAllProductsAdminAPI(shop);
      const stockFiltered = onlyInStock
        ? products.filter(p => p.available !== false)
        : products;
      const preFiltered = preFilterProducts(stockFiltered, bodyShape);
      const fallbackRecs = applyBasicAlgorithm(preFiltered, bodyShape, numberOfSuggestions, minimumMatchScore, measurements);
      console.log(`✓ Fallback algorithm returned ${fallbackRecs.length} recommendations`);
      return fallbackRecs;
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Apply basic algorithmic scoring to products
 * Used as fallback when Claude is disabled or fails
 */
function applyBasicAlgorithm(
  products: Product[],
  bodyShape: string,
  limit: number,
  minimumMatchScore: number,
  measurements?: {
    gender: string;
    age: string;
    bust: number;
    waist: number;
    hips: number;
    shoulders: number;
  }
): ProductRecommendation[] {
  // Convert minimumMatchScore from 0-100 to 0-1 scale for comparison
  const minScoreDecimal = minimumMatchScore / 100;

  const recommendations = products
    .map(product => {
      const suitabilityScore = calculateProductSuitability(product, bodyShape);
      const category = determineCategory(product);
      const sizeRecommendation = getSizeRecommendation(product, bodyShape);

      return {
        product,
        suitabilityScore,
        recommendedSize: sizeRecommendation,
        reasoning: generateRecommendationReasoning(product, bodyShape, suitabilityScore),
        category,
        stylingTip: ""
      };
    })
    .filter(rec => rec.suitabilityScore >= minScoreDecimal)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, limit);

  console.log(`✓ Basic algorithm filtered ${products.length} → ${recommendations.length} products (minScore: ${minimumMatchScore}%)`);

  return recommendations;
}

// Basic product scoring functions
function calculateProductSuitability(product: Product, bodyShape: string): number {
  const productName = product.title || product.name || '';
  const text = `${productName} ${product.description} ${product.productType}`.toLowerCase();

  // Simple keyword-based scoring
  const favorableKeywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["a-line", "empire", "bootcut", "wide-leg", "v-neck"],
    "Apple/Round": ["empire", "wrap", "v-neck", "flow"],
    "Hourglass": ["fitted", "wrap", "belt", "curve"],
    "Inverted Triangle": ["a-line", "wide-leg", "bootcut"],
    "Rectangle/Straight": ["belt", "peplum", "layer"],
  };

  const keywords = favorableKeywords[bodyShape] || [];
  const matches = keywords.filter(kw => text.includes(kw)).length;

  return Math.min(matches / keywords.length, 1.0);
}

function getSizeRecommendation(product: Product, bodyShape: string): string {
  return "Check size chart for best fit";
}

function generateRecommendationReasoning(product: Product, bodyShape: string, score: number): string {
  const productName = product.title || product.name || 'this item';
  return `${productName} is recommended for ${bodyShape} body shape with a ${Math.round(score * 100)}% match score.`;
}

// Pre-filter products to focus Claude on most relevant items
function preFilterProducts(products: Product[], bodyShape: string): Product[] {
  const avoidKeywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["skinny", "pencil skirt", "tight bottom"],
    "Apple/Round": ["crop", "bodycon", "tight waist"],
    "Hourglass": ["oversized", "baggy", "shapeless", "boxy"],
    "Inverted Triangle": ["shoulder pad", "puff sleeve", "ruffle shoulder", "statement shoulder"],
    "Rectangle/Straight": ["shift dress", "straight cut"],
    "V-Shape/Athletic": ["shoulder pad", "structured shoulder", "padded shoulder"],
  };

  const avoid = avoidKeywords[bodyShape] || [];

  return products.filter(product => {
    const productName = product.title || product.name || '';
    const productText = `${productName} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

    // Remove products with avoid keywords
    const hasAvoidKeyword = avoid.some(keyword => productText.includes(keyword.toLowerCase()));
    if (hasAvoidKeyword) return false;

    return true;
  });
}

function buildClaudePrompt(
  bodyShape: string,
  measurements: any,
  products: any[],
  limit: number,
  minimumMatchScore: number,
  customPrompt: string,
  colorSeason?: string,
  enableImageAnalysis?: boolean
): string {
  const measurementInfo = measurements
    ? `
Customer Measurements:
- Gender: ${measurements.gender}
- Age: ${measurements.age}
- Bust: ${measurements.bust}cm
- Waist: ${measurements.waist}cm
- Hips: ${measurements.hips}cm
- Shoulders: ${measurements.shoulders}cm
`
    : "";

  // Body shape specific guidance
  const bodyShapeGuidance: { [key: string]: string } = {
    "Pear/Triangle": "Focus on balancing wider hips with structured shoulders, A-line silhouettes, and drawing attention upward. Avoid tight bottoms.",
    "Apple/Round": "Emphasize defined waist with empire cuts, V-necks, and flowing fabrics. Create vertical lines. Avoid tight waistbands.",
    "Hourglass": "Highlight curves with fitted styles, wrap designs, and belted pieces. Avoid shapeless or overly loose clothing.",
    "Inverted Triangle": "Balance broad shoulders with A-line skirts, wide-leg pants, and minimize shoulder details. Avoid shoulder pads.",
    "Rectangle/Straight": "Create curves with belts, peplum, and structured pieces. Add dimension through layering. Avoid straight cuts.",
    "V-Shape/Athletic": "Show off athletic build with fitted shirts and straight-leg pants. Minimize shoulder emphasis.",
  };

  const guidance = bodyShapeGuidance[bodyShape] || "Consider proportions and personal style.";

  // Color season specific guidance
  const colorSeasonGuidance: { [key: string]: string } = {
    "Spring": "Best Colors: Peach, coral, light turquoise, golden beige, warm pastels, camel. Avoid: Black, pure white, navy.",
    "Summer": "Best Colors: Pastel blue, rose, lavender, cool gray, soft pinks, powder blue. Avoid: Orange, warm browns.",
    "Autumn": "Best Colors: Olive, mustard, terracotta, camel, rust, warm browns, burnt orange. Avoid: Pastels, icy colors.",
    "Winter": "Best Colors: Jewel tones (emerald, ruby, sapphire), icy blue, black, pure white, magenta. Avoid: Warm earth tones."
  };

  const colorGuidance = colorSeason ? colorSeasonGuidance[colorSeason] : "";
  const colorSeasonInfo = colorSeason ? `\nColor Season: ${colorSeason}\nColor Guidance: ${colorGuidance}` : "";

  const imageAnalysisInfo = enableImageAnalysis ? `\n\nIMAGE ANALYSIS: Product images (imageUrl) are provided. Analyze visual features including:
- Colors, patterns, and prints
- Silhouette, cut, and fit
- Fabric texture and drape
- Design details (necklines, sleeves, length)
- Overall style and aesthetics

Use these visual insights along with text descriptions for more accurate recommendations.` : "";

  return `${customPrompt}

${measurementInfo}

Body Shape: ${bodyShape}
Style Guidance: ${guidance}${colorSeasonInfo}${imageAnalysisInfo}

Products Available:
${JSON.stringify(products, null, 2)}

TASK: Select EXACTLY ${limit} DIFFERENT products that will flatter the ${bodyShape} body shape${colorSeason ? ` and match the ${colorSeason} color palette` : ''}.

You MUST provide exactly ${limit} recommendations. Provide honest scores - if some products aren't perfect matches, that's okay, still include them with lower scores. The backend will filter out products below ${minimumMatchScore} points.

For each recommendation, provide:
- **index**: Product index from the list (0-based) - MUST be unique, NO DUPLICATES
- **score**: Honest suitability score (0-100) where 100 = perfect match. Be realistic but inclusive - aim for scores of 65+ for decent matches.
- **reasoning**: Explain WHY this specific product flatters their ${bodyShape} body shape (2-3 sentences with specific design details)
- **sizeAdvice**: Specific sizing guidance for their body shape and proportions
- **stylingTip**: A unique, actionable styling suggestion for THIS SPECIFIC product

CRITICAL RULES:
- MUST return EXACTLY ${limit} products - not less, not more
- NO DUPLICATE PRODUCTS - each index must appear only once
- Each product MUST have unique reasoning and styling tips
- Don't be too strict with scoring - a score of 65-75 means "good match", 75-85 means "great match", 85+ means "excellent match"
- Provide personalized advice, not generic tips
- Prioritize variety across different product types (tops, bottoms, dresses, accessories)

Format your response as valid JSON (no markdown):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "Specific reasoning about why this flatters ${bodyShape}",
      "sizeAdvice": "Specific size guidance",
      "stylingTip": "Unique styling tip for this product"
    }
  ]
}

Return ONLY the JSON, no other text.`;
}

function parseClaudeResponse(text: string, products: Product[], minimumMatchScore: number = 30): ProductRecommendation[] {
  try {
    console.log(`🔍 Parsing Claude response (${text.length} chars, minScore: ${minimumMatchScore})`);

    // Remove markdown code blocks if present
    let jsonText = text.trim();
    const hadMarkdown = jsonText.startsWith("```");
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      console.log('✓ Removed ```json markdown wrapper');
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
      console.log('✓ Removed ``` markdown wrapper');
    }

    // Attempt to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
      console.log(`✅ Successfully parsed JSON response`);
    } catch (parseError: any) {
      // If JSON is truncated, try to salvage partial data
      console.error("❌ JSON parse failed:", parseError.message);
      console.warn("⚠ Attempting to recover partial data...");
      console.warn("Response length:", jsonText.length);
      console.warn("First 200 chars:", jsonText.substring(0, 200));
      console.warn("Last 200 chars:", jsonText.slice(-200));

      // Try to find the last complete recommendation object
      const lastCompleteIndex = jsonText.lastIndexOf('}');
      if (lastCompleteIndex > 0) {
        // Find the recommendations array start
        const arrayStartIndex = jsonText.indexOf('"recommendations"');
        if (arrayStartIndex > 0) {
          // Try to close the JSON properly
          const truncatedJson = jsonText.substring(0, lastCompleteIndex + 1) + ']}';
          try {
            parsed = JSON.parse(truncatedJson);
            console.log("✅ Successfully recovered partial recommendations from truncated JSON");
          } catch (recoveryError: any) {
            console.error("❌ Recovery failed:", recoveryError.message);
            throw parseError; // Re-throw original error
          }
        } else {
          console.error("❌ Could not find 'recommendations' array in response");
          throw parseError;
        }
      } else {
        console.error("❌ Could not find closing brace in response");
        throw parseError;
      }
    }

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.error("❌ Parsed result is not an object:", typeof parsed);
      return [];
    }

    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      console.error("❌ No 'recommendations' array in parsed JSON:", Object.keys(parsed));
      return [];
    }

    console.log(`📋 Found ${parsed.recommendations.length} recommendations in JSON`);

    // DEBUG: Log all scores before filtering
    const allScores = parsed.recommendations.map((r: any) => r.score);
    console.log(`📊 Score distribution from Claude:`, {
      min: Math.min(...allScores),
      max: Math.max(...allScores),
      avg: (allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length).toFixed(1),
      minimumMatchScore,
      scores: allScores.join(', ')
    });

    const recommendations: ProductRecommendation[] = [];
    let skippedLowScore = 0;
    let skippedInvalidIndex = 0;

    for (const rec of parsed.recommendations || []) {
      const productIndex = rec.index;

      // Apply minimum match score filter
      if (rec.score < minimumMatchScore) {
        skippedLowScore++;
        console.log(`⏭ Skipping product ${productIndex} (${products[productIndex]?.title}) with score ${rec.score} (below minimum ${minimumMatchScore})`);
        continue;
      }

      if (productIndex >= 0 && productIndex < products.length) {
        const product = products[productIndex];
        recommendations.push({
          product,
          suitabilityScore: rec.score / 100, // Convert to 0-1 scale
          recommendedSize: rec.sizeAdvice || "Check size chart",
          reasoning: rec.reasoning || "Recommended by AI stylist",
          category: determineCategory(product),
          stylingTip: rec.stylingTip || ""
        });
      } else {
        skippedInvalidIndex++;
        console.warn(`⚠ Invalid product index ${productIndex} (products array length: ${products.length})`);
      }
    }

    console.log(`✅ Successfully parsed ${recommendations.length} recommendations from Claude response`);
    if (skippedLowScore > 0) {
      console.log(`⏭ Skipped ${skippedLowScore} products below minimum score ${minimumMatchScore}`);
    }
    if (skippedInvalidIndex > 0) {
      console.warn(`⚠ Skipped ${skippedInvalidIndex} products with invalid indices`);
    }

    return recommendations;
  } catch (error: any) {
    console.error("❌ CRITICAL ERROR parsing Claude response:", error.message);
    console.error("   Error stack:", error.stack);
    console.error("   Raw response length:", text.length);
    console.error("   Raw response (first 500 chars):", text.substring(0, 500));
    console.error("   Raw response (last 500 chars):", text.slice(-500));
    return [];
  }
}

function determineCategory(product: Product): string {
  const productName = product.title || product.name || '';
  const text = `${productName} ${product.description} ${product.productType}`.toLowerCase();

  if (text.includes("dress")) return "dresses";
  if (text.includes("top") || text.includes("shirt") || text.includes("blouse")) return "tops";
  if (text.includes("pant") || text.includes("jean") || text.includes("trouser")) return "bottoms";

  return "general";
}
