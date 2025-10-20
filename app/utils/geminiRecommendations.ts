import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db.server";
import { loadGeminiSettings } from "./geminiAnalysis";

/**
 * PHASE 2: Gemini Recommendations Utility
 *
 * This file handles real-time product recommendations using Gemini 2.0 Flash.
 * Uses CACHED product analysis from FilteredSelectionWithImgAnalyzed table.
 * NO IMAGES sent to Gemini - only text descriptions + cached visual analysis.
 */

export interface ProductRecommendation {
  product: CachedProduct;
  suitabilityScore: number;
  recommendedSize?: string;
  reasoning: string;
  category: string;
  stylingTip?: string;
}

export interface CachedProduct {
  id: string;
  shopifyProductId: string;
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
  // Cached Gemini analysis
  detectedColors?: string[];
  colorSeasons?: string[];
  silhouetteType?: string;
  styleClassification?: string[];
  fabricTexture?: string;
  designDetails?: string[];
  patternType?: string;
}

// Default recommendation prompt for Gemini
export const DEFAULT_GEMINI_RECOMMENDATION_PROMPT = `You are an expert fashion stylist and personal shopper with deep knowledge of body proportions and style optimization. Your goal is to select products that will genuinely flatter the customer's body shape and color season preferences.

You analyze clothing based on:
- Silhouette and how it interacts with different body shapes
- Color harmony with seasonal color analysis
- Fabric, drape, and structure
- Necklines, waistlines, and hem styles
- Design details and pattern placement
- Fit and proportion principles

You provide honest, specific recommendations that help customers look and feel their best.`;

/**
 * Get product recommendations using Gemini AI with CACHED image analysis
 * NO IMAGES sent to Gemini - uses pre-analyzed data from database
 */
export async function getGeminiProductRecommendations(
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
  valuesPreferences?: {
    sustainability: boolean;
    budgetRange?: string;
    styles: string[];
  }
): Promise<ProductRecommendation[]> {
  try {
    console.log(`🤖 Getting Gemini recommendations for ${bodyShape} (${shop})`);

    // Load Gemini settings
    const geminiSettings = await loadGeminiSettings(shop);

    if (!geminiSettings.enabled) {
      console.log("⚠ Gemini AI is disabled, using fallback algorithm");
      return applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock);
    }

    // STEP 1: Fetch cached analyzed products from database
    console.log(`📊 Fetching cached analyzed products from database...`);
    const cachedProducts = await fetchCachedProducts(shop, onlyInStock, maxProductsToScan);

    if (cachedProducts.length === 0) {
      console.log("⚠ No analyzed products found in cache. Admin needs to run refresh first.");
      return [];
    }

    console.log(`✓ Found ${cachedProducts.length} cached products`);

    // STEP 2: Filter by color season if provided
    let filteredProducts = cachedProducts;

    if (colorSeason) {
      filteredProducts = cachedProducts.filter(p =>
        p.colorSeasons && p.colorSeasons.includes(colorSeason)
      );
      console.log(`✓ Color season filter (${colorSeason}): ${cachedProducts.length} → ${filteredProducts.length} products`);
    }

    if (filteredProducts.length === 0) {
      console.log("⚠ No products match color season filter");
      return [];
    }

    // STEP 3: Prepare product data for Gemini (text-only, using cached analysis)
    const productsForAI = filteredProducts.map((p, index) => ({
      index,
      title: p.title,
      description: (p.description || '').substring(0, 300),
      productType: p.productType || '',
      tags: (p.tags || []).join(", "),
      price: p.price,
      inStock: p.inStock,
      availableSizes: (p.availableSizes || []).join(", "),
      // Include CACHED visual analysis (no images!)
      visualAnalysis: {
        colors: p.detectedColors || [],
        colorSeasons: p.colorSeasons || [],
        silhouette: p.silhouetteType || 'Unknown',
        styles: p.styleClassification || [],
        fabric: p.fabricTexture || 'Unknown',
        details: p.designDetails || [],
        pattern: p.patternType || 'Unknown',
      },
    }));

    console.log(`✓ Prepared ${productsForAI.length} products for Gemini (text-only, NO images)`);

    // STEP 4: Build prompt for Gemini
    const prompt = buildGeminiRecommendationPrompt(
      bodyShape,
      measurements,
      productsForAI,
      numberOfSuggestions,
      minimumMatchScore,
      colorSeason,
      geminiSettings
    );

    // STEP 5: Call Gemini API (text-only)
    const apiKey = geminiSettings.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("⚠ No Gemini API key configured, falling back to basic algorithm");
      return applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiSettings.model });

    console.log(`🤖 Calling Gemini API (${geminiSettings.model})...`);
    const startTime = Date.now();

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Gemini API responded in ${elapsedTime}s`);
    console.log(`📝 Response length: ${text.length} chars`);

    // STEP 6: Parse Gemini's response
    const recommendations = parseGeminiRecommendationResponse(text, filteredProducts, minimumMatchScore);

    if (recommendations.length === 0) {
      console.error(`❌ Gemini returned 0 recommendations after parsing`);
      return applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock);
    }

    console.log(`✅ Gemini returned ${recommendations.length} recommendations`);

    const finalRecommendations = recommendations.slice(0, numberOfSuggestions);
    console.log(`✅ Returning ${finalRecommendations.length} final recommendations`);

    return finalRecommendations;
  } catch (error) {
    console.error("❌ Error getting Gemini recommendations:", error);
    // Fallback to basic algorithm
    try {
      console.log("⚠ Attempting fallback to basic algorithm...");
      return await applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock);
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Fetch cached analyzed products from database
 */
async function fetchCachedProducts(
  shop: string,
  onlyInStock: boolean,
  maxProductsToScan: number
): Promise<CachedProduct[]> {
  try {
    const where: any = { shop };

    if (onlyInStock) {
      where.inStock = true;
    }

    const products = await db.filteredSelectionWithImgAnalyzed.findMany({
      where,
      orderBy: { analyzedAt: 'desc' },
      take: maxProductsToScan > 0 ? maxProductsToScan : undefined,
    });

    return products.map(p => ({
      id: p.id,
      shopifyProductId: p.shopifyProductId,
      title: p.title,
      handle: p.handle || undefined,
      description: p.description || undefined,
      productType: p.productType || undefined,
      tags: p.tags || [],
      price: p.price.toString(),
      imageUrl: p.imageUrl || undefined,
      variants: p.variants as any[] || [],
      inStock: p.inStock,
      availableSizes: p.availableSizes || [],
      detectedColors: p.detectedColors || [],
      colorSeasons: p.colorSeasons || [],
      silhouetteType: p.silhouetteType || undefined,
      styleClassification: p.styleClassification || [],
      fabricTexture: p.fabricTexture || undefined,
      designDetails: p.designDetails || [],
      patternType: p.patternType || undefined,
    }));
  } catch (error) {
    console.error("❌ Error fetching cached products:", error);
    return [];
  }
}

/**
 * Build prompt for Gemini recommendations (text-only, using cached analysis)
 */
function buildGeminiRecommendationPrompt(
  bodyShape: string,
  measurements: any,
  products: any[],
  limit: number,
  minimumMatchScore: number,
  colorSeason?: string,
  geminiSettings?: any
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

  const bodyShapeGuidance: { [key: string]: string } = {
    "Pear/Triangle": "Focus on balancing wider hips with structured shoulders, A-line silhouettes, and drawing attention upward. Avoid tight bottoms.",
    "Apple/Round": "Emphasize defined waist with empire cuts, V-necks, and flowing fabrics. Create vertical lines. Avoid tight waistbands.",
    "Hourglass": "Highlight curves with fitted styles, wrap designs, and belted pieces. Avoid shapeless or overly loose clothing.",
    "Inverted Triangle": "Balance broad shoulders with A-line skirts, wide-leg pants, and minimize shoulder details. Avoid shoulder pads.",
    "Rectangle/Straight": "Create curves with belts, peplum, and structured pieces. Add dimension through layering. Avoid straight cuts.",
    "V-Shape/Athletic": "Show off athletic build with fitted shirts and straight-leg pants. Minimize shoulder emphasis.",
  };

  const colorSeasonGuidance: { [key: string]: string } = {
    "Spring": "Best Colors: Peach, coral, light turquoise, golden beige, warm pastels, camel. Avoid: Black, pure white, navy.",
    "Summer": "Best Colors: Pastel blue, rose, lavender, cool gray, soft pinks, powder blue. Avoid: Orange, warm browns.",
    "Autumn": "Best Colors: Olive, mustard, terracotta, camel, rust, warm browns, burnt orange. Avoid: Pastels, icy colors.",
    "Winter": "Best Colors: Jewel tones (emerald, ruby, sapphire), icy blue, black, pure white, magenta. Avoid: Warm earth tones."
  };

  const guidance = bodyShapeGuidance[bodyShape] || "Consider proportions and personal style.";
  const colorGuidance = colorSeason ? colorSeasonGuidance[colorSeason] : "";
  const colorSeasonInfo = colorSeason ? `\nColor Season: ${colorSeason}\nColor Guidance: ${colorGuidance}` : "";

  // Use custom systemPrompt from settings, or fall back to default
  const systemPrompt = geminiSettings?.systemPrompt || DEFAULT_GEMINI_RECOMMENDATION_PROMPT;

  return `${systemPrompt}

${measurementInfo}

Body Shape: ${bodyShape}
Style Guidance: ${guidance}${colorSeasonInfo}

Products Available (with PRE-ANALYZED visual data):
${JSON.stringify(products, null, 2)}

IMPORTANT NOTES:
- Each product includes "visualAnalysis" with PRE-ANALYZED data from Gemini image analysis
- You are NOT seeing images - use the cached visual data (colors, silhouette, fabric, etc.)
- This cached data is HIGHLY ACCURATE and should be trusted
- The visual analysis was done by Gemini 2.0 Flash analyzing product images

TASK: Select EXACTLY ${limit} DIFFERENT products that will flatter the ${bodyShape} body shape${colorSeason ? ` and match the ${colorSeason} color palette` : ''}.

You MUST provide exactly ${limit} recommendations. Provide honest scores - if some products aren't perfect matches, that's okay, still include them with lower scores. The backend will filter out products below ${minimumMatchScore} points.

For each recommendation, provide:
- **index**: Product index from the list (0-based) - MUST be unique, NO DUPLICATES
- **score**: Honest suitability score (0-100) where 100 = perfect match. Be realistic but inclusive - aim for scores of 65+ for decent matches.
- **reasoning**: Explain WHY this specific product flatters their ${bodyShape} body shape using the visual analysis data (2-3 sentences with specific design details)
- **sizeAdvice**: Specific sizing guidance for their body shape and proportions
- **stylingTip**: A unique, actionable styling suggestion for THIS SPECIFIC product

CRITICAL RULES:
- MUST return EXACTLY ${limit} products - not less, not more
- NO DUPLICATE PRODUCTS - each index must appear only once
- Each product MUST have unique reasoning and styling tips
- Don't be too strict with scoring - a score of 65-75 means "good match", 75-85 means "great match", 85+ means "excellent match"
- Use the cached visualAnalysis data to make informed recommendations
- Provide personalized advice, not generic tips
- Prioritize variety across different product types (tops, bottoms, dresses, accessories)

Format your response as valid JSON (no markdown):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "Specific reasoning about why this flatters ${bodyShape} using visual analysis data",
      "sizeAdvice": "Specific size guidance",
      "stylingTip": "Unique styling tip for this product"
    }
  ]
}

Return ONLY the JSON, no other text.`;
}

/**
 * Parse Gemini's JSON response into recommendations
 */
function parseGeminiRecommendationResponse(
  text: string,
  products: CachedProduct[],
  minimumMatchScore: number
): ProductRecommendation[] {
  try {
    console.log(`🔍 Parsing Gemini response (${text.length} chars, minScore: ${minimumMatchScore})`);

    // Remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      console.log('✓ Removed ```json markdown wrapper');
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
      console.log('✓ Removed ``` markdown wrapper');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError: any) {
      console.warn(`⚠️ Initial JSON parse failed: ${parseError.message}`);
      console.log(`🔧 Attempting to repair JSON...`);

      // Try to fix common JSON errors
      // 1. Remove trailing commas before } or ]
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');

      // 2. Try to find and extract just the recommendations array
      const recommendationsMatch = jsonText.match(/"recommendations"\s*:\s*\[([\s\S]*)\]/);
      if (recommendationsMatch) {
        jsonText = `{"recommendations": [${recommendationsMatch[1]}]}`;
        console.log(`✓ Extracted recommendations array`);
      }

      // 3. Try parsing again
      try {
        parsed = JSON.parse(jsonText);
        console.log(`✅ Successfully repaired and parsed JSON`);
      } catch (secondError: any) {
        // Last resort: try to salvage what we can
        console.error(`❌ JSON repair failed: ${secondError.message}`);
        console.error(`   Position: ${secondError.message.match(/position (\d+)/)?.[1] || 'unknown'}`);
        console.error(`   JSON excerpt near error:`, jsonText.substring(Math.max(0, (parseInt(secondError.message.match(/position (\d+)/)?.[1] || '0') - 100)), Math.min(jsonText.length, (parseInt(secondError.message.match(/position (\d+)/)?.[1] || '0') + 100))));
        throw secondError;
      }
    }

    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      console.error("❌ No 'recommendations' array in parsed JSON");
      return [];
    }

    console.log(`📋 Found ${parsed.recommendations.length} recommendations in JSON`);

    const allScores = parsed.recommendations.map((r: any) => r.score);
    console.log(`📊 Score distribution:`, {
      min: Math.min(...allScores),
      max: Math.max(...allScores),
      avg: (allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length).toFixed(1),
      minimumMatchScore,
    });

    const recommendations: ProductRecommendation[] = [];
    let skippedLowScore = 0;
    let skippedInvalidIndex = 0;

    for (const rec of parsed.recommendations || []) {
      const productIndex = rec.index;

      // Apply minimum match score filter
      if (rec.score < minimumMatchScore) {
        skippedLowScore++;
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

    console.log(`✅ Successfully parsed ${recommendations.length} recommendations`);
    if (skippedLowScore > 0) {
      console.log(`⏭ Skipped ${skippedLowScore} products below minimum score ${minimumMatchScore}`);
    }
    if (skippedInvalidIndex > 0) {
      console.warn(`⚠ Skipped ${skippedInvalidIndex} products with invalid indices`);
    }

    return recommendations;
  } catch (error: any) {
    console.error("❌ Error parsing Gemini response:", error.message);
    console.error("   Raw response (first 500 chars):", text.substring(0, 500));
    return [];
  }
}

/**
 * Basic fallback algorithm when Gemini is disabled or fails
 */
async function applyBasicAlgorithm(
  shop: string,
  bodyShape: string,
  limit: number,
  minimumMatchScore: number,
  onlyInStock: boolean
): Promise<ProductRecommendation[]> {
  try {
    const products = await fetchCachedProducts(shop, onlyInStock, 0);
    const minScoreDecimal = minimumMatchScore / 100;

    const recommendations = products
      .map(product => {
        const suitabilityScore = calculateProductSuitability(product, bodyShape);
        const category = determineCategory(product);

        return {
          product,
          suitabilityScore,
          recommendedSize: "Check size chart for best fit",
          reasoning: `${product.title} is recommended for ${bodyShape} body shape.`,
          category,
          stylingTip: ""
        };
      })
      .filter(rec => rec.suitabilityScore >= minScoreDecimal)
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
      .slice(0, limit);

    console.log(`✓ Basic algorithm filtered ${products.length} → ${recommendations.length} products`);
    return recommendations;
  } catch (error) {
    console.error("❌ Error in basic algorithm:", error);
    return [];
  }
}

/**
 * Basic product scoring for fallback
 */
function calculateProductSuitability(product: CachedProduct, bodyShape: string): number {
  const text = `${product.title} ${product.description} ${product.productType}`.toLowerCase();

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

/**
 * Determine product category
 */
function determineCategory(product: CachedProduct): string {
  const text = `${product.title} ${product.description} ${product.productType}`.toLowerCase();

  if (text.includes("dress")) return "dresses";
  if (text.includes("top") || text.includes("shirt") || text.includes("blouse")) return "tops";
  if (text.includes("pant") || text.includes("jean") || text.includes("trouser")) return "bottoms";

  return "general";
}
