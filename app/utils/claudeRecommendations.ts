import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db.server";
import { loadSettings } from "./settings";
import { fetchAllProducts, type MCPProduct } from "./shopifyMCP";
import { preFilterProducts as mcpPreFilterProducts, calculateProductSuitability as mcpCalculateProductSuitability, getSizeRecommendation as mcpGetSizeRecommendation, generateRecommendationReasoning as mcpGenerateRecommendationReasoning } from "./mcpProductRecommendations";

export interface ProductRecommendation {
  product: MCPProduct;
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
      maxTokens: 4096,
    };
  } catch (error) {
    console.error("Error loading Claude settings:", error);
    return {
      apiKey: undefined,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      recommendationPrompt: DEFAULT_RECOMMENDATION_PROMPT,
      enabled: true,
      temperature: 0.7,
      maxTokens: 4096,
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
 * Get product recommendations using Claude AI with Shopify MCP
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
  limit: number = 12,
  onlyInStock: boolean = true
): Promise<ProductRecommendation[]> {
  try {
    // Load Claude settings for this shop
    const claudeSettings = await loadClaudeSettings(shop);

    // Fetch ALL products from MCP Storefront
    console.log(`🔄 Fetching products from MCP for ${storeDomain}...`);
    const products = await fetchAllProducts(storeDomain, bodyShape);

    if (products.length === 0) {
      console.log("No products found in store");
      return [];
    }

    console.log(`✓ Fetched ${products.length} total products from store`);

    // STEP 1: Filter by stock availability (if enabled)
    const stockFilteredProducts = onlyInStock
      ? products.filter(product => {
          return product.variants && product.variants.some(v => v.available === true);
        })
      : products;

    console.log(`✓ Stock filter: ${products.length} → ${stockFilteredProducts.length} ${onlyInStock ? 'in-stock' : 'all'} products`);

    // STEP 2: Pre-filter - Remove products with "avoid" keywords for this body shape
    const preFilteredProducts = preFilterProductsMCP(stockFilteredProducts, bodyShape);

    console.log(`✓ Pre-filter (avoid keywords): ${stockFilteredProducts.length} → ${preFilteredProducts.length} relevant products for ${bodyShape}`);

    // Check if we have products to recommend
    if (preFilteredProducts.length === 0) {
      console.log("No products passed pre-filtering");
      return [];
    }

    // If Claude is disabled, fall back to algorithmic recommendations
    if (!claudeSettings.enabled) {
      console.log("⚠ Claude AI is disabled, using fallback algorithm on pre-filtered products");
      return applyBasicAlgorithmMCP(preFilteredProducts, bodyShape, limit, measurements);
    }

    // STEP 3: Prepare product data for Claude AI
    const productsForAI = preFilteredProducts.map((p, index) => ({
      index,
      title: p.title,
      description: p.description.substring(0, 300),
      productType: p.productType,
      tags: p.tags.join(", "),
      price: p.variants[0]?.price || "N/A"
    }));

    console.log(`✓ Prepared ${productsForAI.length} products for Claude AI analysis`);

    // Build the prompt for Claude
    const prompt = buildClaudePrompt(
      bodyShape,
      measurements,
      productsForAI,
      limit,
      claudeSettings.recommendationPrompt
    );

    // STEP 4: Check API key and call Claude
    const apiKey = claudeSettings.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error("⚠ No Anthropic API key configured, falling back to basic algorithm");
      return applyBasicAlgorithmMCP(preFilteredProducts, bodyShape, limit, measurements);
    }

    // Create Anthropic client with the appropriate API key
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    console.log(`🤖 Calling Claude AI (model: claude-sonnet-4, temp: ${claudeSettings.temperature}, max_tokens: ${claudeSettings.maxTokens})...`);

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
    const recommendations = parseClaudeResponse(responseText, preFilteredProducts);

    console.log(`✓ Claude AI returned ${recommendations.length} recommendations`);

    return recommendations.slice(0, limit);
  } catch (error) {
    console.error("❌ Error getting Claude recommendations:", error);
    // Fallback to basic algorithm if Claude fails
    try {
      console.log("⚠ Attempting fallback to basic algorithm...");
      // Try to get pre-filtered products if available
      const products = await fetchAllProducts(storeDomain, bodyShape);
      const stockFiltered = onlyInStock
        ? products.filter(p => p.available !== false)
        : products;
      const preFiltered = preFilterProductsMCP(stockFiltered, bodyShape);
      const fallbackRecs = applyBasicAlgorithmMCP(preFiltered, bodyShape, limit, measurements);
      console.log(`✓ Fallback algorithm returned ${fallbackRecs.length} recommendations`);
      return fallbackRecs;
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Apply basic algorithmic scoring to MCP products
 * Used as fallback when Claude is disabled or fails
 */
function applyBasicAlgorithmMCP(
  products: MCPProduct[],
  bodyShape: string,
  limit: number,
  measurements?: {
    gender: string;
    age: string;
    bust: number;
    waist: number;
    hips: number;
    shoulders: number;
  }
): ProductRecommendation[] {
  const recommendations = products
    .map(product => {
      const suitabilityScore = mcpCalculateProductSuitability(product, bodyShape);
      const category = determineCategory(product);
      const sizeRecommendation = mcpGetSizeRecommendation(product, bodyShape);

      return {
        product,
        suitabilityScore,
        recommendedSize: sizeRecommendation,
        reasoning: mcpGenerateRecommendationReasoning(product, bodyShape, suitabilityScore),
        category,
        stylingTip: ""
      };
    })
    .filter(rec => rec.suitabilityScore > 0.3)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, limit);

  return recommendations;
}

// Pre-filter MCP products to focus Claude on most relevant items
function preFilterProductsMCP(products: MCPProduct[], bodyShape: string): MCPProduct[] {
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
    const productText = `${product.name} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

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
- Only recommend products with score ≥ 50
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

function parseClaudeResponse(text: string, products: Product[]): ProductRecommendation[] {
  try {
    // Remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const parsed = JSON.parse(jsonText);
    const recommendations: ProductRecommendation[] = [];

    for (const rec of parsed.recommendations || []) {
      const productIndex = rec.index;
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

    return recommendations;
  } catch (error) {
    console.error("Error parsing Claude response:", error);
    console.error("Raw response:", text);
    return [];
  }
}

function determineCategory(product: MCPProduct): string {
  const text = `${product.name} ${product.description} ${product.productType}`.toLowerCase();

  if (text.includes("dress")) return "dresses";
  if (text.includes("top") || text.includes("shirt") || text.includes("blouse")) return "tops";
  if (text.includes("pant") || text.includes("jean") || text.includes("trouser")) return "bottoms";

  return "general";
}
