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
      maxTokens: 16384, // Increased for longer responses
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
    const allProducts: Product[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
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
                variants(first: 1) {
                  edges {
                    node {
                      price
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

      const data = await response.json();

      if (data.errors) {
        console.error('❌ GraphQL errors:', data.errors);
        break;
      }

      const products = data?.data?.products?.edges || [];

      // Transform products to unified format
      const transformedProducts = products.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        name: edge.node.title, // Alias for compatibility
        handle: edge.node.handle,
        description: edge.node.description || '',
        productType: edge.node.productType || '',
        tags: edge.node.tags || [],
        price: edge.node.variants?.edges?.[0]?.node?.price || '',
        image: edge.node.featuredImage?.url || '',
        imageUrl: edge.node.featuredImage?.url || '', // Alias
        available: (edge.node.variants?.edges?.[0]?.node?.inventoryQuantity || 0) > 0,
        variants: edge.node.variants?.edges?.map((v: any) => ({
          price: v.node.price,
          available: (v.node.inventoryQuantity || 0) > 0
        })) || []
      }));

      allProducts.push(...transformedProducts);

      hasNextPage = data?.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data?.data?.products?.pageInfo?.endCursor || null;

      console.log(`✓ Fetched ${transformedProducts.length} products (total: ${allProducts.length}, hasNextPage: ${hasNextPage})`);
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
  onlyInStock: boolean = false
): Promise<ProductRecommendation[]> {
  try {
    // Load Claude settings for this shop
    const claudeSettings = await loadClaudeSettings(shop);

    // Fetch ALL products from Shopify Admin API
    console.log(`🔄 Fetching products via Admin API for ${shop}...`);
    let products = await fetchAllProductsAdminAPI(shop);

    if (products.length === 0) {
      console.log("No products found in store");
      return [];
    }

    console.log(`✓ Fetched ${products.length} total products from store`);

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

    // STEP 2: Pre-filter - Remove products with "avoid" keywords for this body shape
    const preFilteredProducts = preFilterProducts(stockFilteredProducts, bodyShape);

    console.log(`✓ Pre-filter (avoid keywords): ${stockFilteredProducts.length} → ${preFilteredProducts.length} relevant products for ${bodyShape}`);

    // Check if we have products to recommend
    if (preFilteredProducts.length === 0) {
      console.log("No products passed pre-filtering");
      return [];
    }

    // If Claude is disabled, fall back to algorithmic recommendations
    if (!claudeSettings.enabled) {
      console.log("⚠ Claude AI is disabled, using fallback algorithm on pre-filtered products");
      return applyBasicAlgorithm(preFilteredProducts, bodyShape, numberOfSuggestions, minimumMatchScore, measurements);
    }

    // STEP 3: Prepare product data for Claude AI
    const productsForAI = preFilteredProducts.map((p, index) => ({
      index,
      title: p.title || p.name || 'Untitled Product',
      description: (p.description || '').substring(0, 300),
      productType: p.productType || '',
      tags: (p.tags || []).join(", "),
      price: p.variants?.[0]?.price || p.price || "N/A"
    }));

    console.log(`✓ Prepared ${productsForAI.length} products for Claude AI analysis`);

    // Build the prompt for Claude
    const prompt = buildClaudePrompt(
      bodyShape,
      measurements,
      productsForAI,
      numberOfSuggestions,
      minimumMatchScore,
      claudeSettings.recommendationPrompt
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

    // Call Claude API
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: claudeSettings.maxTokens,
      temperature: claudeSettings.temperature,
      system: claudeSettings.systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    // STEP 5: Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log(`📝 Claude response length: ${responseText.length} chars`);
    console.log(`📝 Claude stop_reason: ${message.stop_reason}`);
    console.log(`📝 Claude response (first 500 chars): ${responseText.substring(0, 500)}`);
    console.log(`📝 Claude response (last 500 chars): ${responseText.slice(-500)}`);

    if (message.stop_reason === 'max_tokens') {
      console.warn(`⚠ WARNING: Claude hit max_tokens limit! Response may be truncated.`);
      console.warn(`   Consider increasing maxTokens or reducing number of products sent to Claude.`);
    }

    const recommendations = parseClaudeResponse(responseText, preFilteredProducts, minimumMatchScore);

    console.log(`✓ Claude AI returned ${recommendations.length} recommendations after parsing`);

    return recommendations.slice(0, numberOfSuggestions);
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
    "Pear/Triangle": ["tight-fit-bottom", "skinny-jean", "pencil-skirt"],
    "Apple/Round": ["tight-waist", "crop-top", "bodycon"],
    "Hourglass": ["oversized", "baggy", "shapeless"],
    "Inverted Triangle": ["shoulder-pad", "puff-sleeve", "statement-shoulder"],
    "Rectangle/Straight": ["straight-cut", "shift-dress"],
    "V-Shape/Athletic": ["heavily-structured-shoulder"],
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
  customPrompt: string
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

  return `${customPrompt}

${measurementInfo}

Body Shape: ${bodyShape}
Style Guidance: ${guidance}

Products Available:
${JSON.stringify(products, null, 2)}

TASK: Select the top ${limit} DIFFERENT products that will flatter the ${bodyShape} body shape.

For each recommendation, provide:
- **index**: Product index from the list (0-based) - MUST be unique, NO DUPLICATES
- **score**: Suitability score (0-100) where 100 = perfect match
- **reasoning**: Explain WHY this specific product flatters their ${bodyShape} body shape (2-3 sentences with specific design details)
- **sizeAdvice**: Specific sizing guidance for their body shape and proportions
- **stylingTip**: A unique, actionable styling suggestion for THIS SPECIFIC product

CRITICAL RULES:
- NO DUPLICATE PRODUCTS - each index must appear only once
- Each product MUST have unique reasoning and styling tips
- Only recommend products with score ≥ ${minimumMatchScore}
- Be very selective and specific
- Provide personalized advice, not generic tips

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
    // Remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    // Attempt to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      // If JSON is truncated, try to salvage partial data
      console.warn("⚠ JSON parse failed, attempting to recover partial data...");
      console.warn("Response length:", jsonText.length);
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
            console.log("✓ Successfully recovered partial recommendations");
          } catch (recoveryError) {
            console.error("❌ Recovery failed:", recoveryError);
            throw parseError; // Re-throw original error
          }
        } else {
          throw parseError;
        }
      } else {
        throw parseError;
      }
    }

    const recommendations: ProductRecommendation[] = [];

    for (const rec of parsed.recommendations || []) {
      const productIndex = rec.index;

      // Apply minimum match score filter
      if (rec.score < minimumMatchScore) {
        console.log(`⏭ Skipping product ${productIndex} with score ${rec.score} (below minimum ${minimumMatchScore})`);
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
      }
    }

    console.log(`✓ Successfully parsed ${recommendations.length} recommendations from Claude response (minScore: ${minimumMatchScore})`);
    return recommendations;
  } catch (error) {
    console.error("❌ Error parsing Claude response:", error);
    console.error("Raw response length:", text.length);
    console.error("Raw response (first 500 chars):", text.substring(0, 500));
    console.error("Raw response (last 500 chars):", text.slice(-500));
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
