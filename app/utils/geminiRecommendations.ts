import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db.server";
import { loadGeminiSettings, retryWithBackoff } from "./geminiAnalysis";

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
    console.log(`📋 Values Preferences:`, valuesPreferences);

    // Load Gemini settings
    const geminiSettings = await loadGeminiSettings(shop);

    if (!geminiSettings.enabled) {
      console.log("⚠ Gemini AI is disabled, using fallback algorithm");
      return applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock, measurements?.gender);
    }

    // STEP 1: Fetch cached analyzed products from database
    console.log(`📊 Fetching cached analyzed products from database...`);
    const cachedProducts = await fetchCachedProducts(shop, onlyInStock, maxProductsToScan, measurements?.gender);

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

    // STEP 2.5: Filter by budget range if provided
    if (valuesPreferences?.budgetRange) {
      const beforeBudgetFilter = filteredProducts.length;
      filteredProducts = filterByBudget(filteredProducts, valuesPreferences.budgetRange, geminiSettings);
      console.log(`✓ Budget filter (${valuesPreferences.budgetRange}): ${beforeBudgetFilter} → ${filteredProducts.length} products`);
    }

    if (filteredProducts.length === 0) {
      console.log("⚠ No products match filters (color season / budget)");
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
      geminiSettings,
      valuesPreferences
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

    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;
    const text = response.text();

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Gemini API responded in ${elapsedTime}s`);
    console.log(`📝 Response length: ${text.length} chars`);

    // STEP 6: Parse Gemini's response
    const recommendations = parseGeminiRecommendationResponse(text, filteredProducts, minimumMatchScore);

    if (recommendations.length === 0) {
      console.error(`❌ Gemini returned 0 recommendations after parsing`);
      return applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock, measurements?.gender);
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
      return await applyBasicAlgorithm(shop, bodyShape, numberOfSuggestions, minimumMatchScore, onlyInStock, measurements?.gender);
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Filter products by budget range using admin-configured price ranges
 */
function filterByBudget(products: CachedProduct[], budgetRange: string, geminiSettings: any): CachedProduct[] {
  // Get budget ranges from admin settings (with fallback defaults)
  const lowMax = parseFloat(geminiSettings.budgetLowMax?.toString() || '30');
  const mediumMax = parseFloat(geminiSettings.budgetMediumMax?.toString() || '80');
  const highMax = parseFloat(geminiSettings.budgetHighMax?.toString() || '200');

  const budgetRanges: { [key: string]: { min: number; max: number; label: string } } = {
    'low': { min: 0, max: lowMax, label: `Under $${lowMax}` },
    'medium': { min: lowMax, max: mediumMax, label: `$${lowMax}-$${mediumMax}` },
    'high': { min: mediumMax, max: highMax, label: `$${mediumMax}-$${highMax}` },
    'luxury': { min: highMax, max: Infinity, label: `$${highMax}+` }
  };

  const range = budgetRanges[budgetRange];
  if (!range) {
    console.warn(`⚠ Unknown budget range: ${budgetRange}, skipping budget filter`);
    return products;
  }

  console.log(`💰 Budget range "${budgetRange}": ${range.label} (${range.min} - ${range.max === Infinity ? '∞' : range.max})`);

  return products.filter(p => {
    const price = parseFloat(p.price);
    // Filter out invalid prices (0 or negative) and apply budget range
    return price > 0 && price >= range.min && price < range.max;
  });
}

/**
 * Helper function to filter products by gender based on tags, productType, title, and description
 */
function filterProductsByGender(products: CachedProduct[], gender: string | undefined): CachedProduct[] {
  if (!gender) return products;

  const genderLower = gender.toLowerCase();

  // Skip filtering for non-binary or unspecified
  if (genderLower !== 'man' && genderLower !== 'woman') {
    return products;
  }

  return products.filter(product => {
    const text = `${product.title} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

    if (genderLower === 'man') {
      // For men: exclude obvious women's items
      const womenKeywords = ['women', 'womens', 'woman', 'ladies', 'dress', 'skirt', 'blouse', 'bra', 'maternity', 'feminine'];
      const hasWomenKeyword = womenKeywords.some(kw => text.includes(kw));

      // Also check if it explicitly mentions men's or is unisex
      const menKeywords = ['men', 'mens', 'man', 'male', 'unisex', 'neutral'];
      const hasMenKeyword = menKeywords.some(kw => text.includes(kw));

      // Keep product if it has men keywords OR doesn't have women keywords
      return hasMenKeyword || !hasWomenKeyword;
    } else if (genderLower === 'woman') {
      // For women: exclude obvious men's items
      const menKeywords = ['men\'s', 'mens', 'man\'s', 'male'];
      const hasMenKeyword = menKeywords.some(kw => text.includes(kw));

      // Also check if it explicitly mentions women's or is unisex
      const womenKeywords = ['women', 'womens', 'woman', 'ladies', 'female', 'unisex', 'neutral'];
      const hasWomenKeyword = womenKeywords.some(kw => text.includes(kw));

      // Keep product if it has women keywords OR doesn't have men keywords
      return hasWomenKeyword || !hasMenKeyword;
    }

    return true;
  });
}

/**
 * Fetch cached analyzed products from database with priority ordering
 * HYBRID APPROACH: Uses pre-calculated cached priority scores from database
 */
async function fetchCachedProducts(
  shop: string,
  onlyInStock: boolean,
  maxProductsToScan: number,
  gender?: string
): Promise<CachedProduct[]> {
  try {
    const where: any = {
      shop,
      price: { gt: 0 } // Filter out $0 and invalid prices
    };

    if (onlyInStock) {
      where.inStock = true;
    }

    // Fetch Gemini settings to check if image analysis is enabled
    const geminiSettings = await db.geminiSettings.findUnique({
      where: { shop },
    });
    const useImageAnalysis = geminiSettings?.useImageAnalysis ?? true;

    // Fetch products from appropriate table based on image analysis setting
    // HYBRID CACHING: Use cached priorityScore from database, sorted at DB level for performance
    let products: any[];

    if (useImageAnalysis) {
      // Use FilteredSelectionWithImgAnalyzed (has AI analysis data)
      console.log(`📊 Fetching from FilteredSelectionWithImgAnalyzed (image analysis enabled)`);
      products = await db.filteredSelectionWithImgAnalyzed.findMany({
        where,
        orderBy: { priorityScore: 'desc' }, // Use cached priority score from database
        take: maxProductsToScan > 0 ? maxProductsToScan : undefined,
      });
    } else {
      // Use FilteredSelection (basic mode, no AI analysis)
      console.log(`📊 Fetching from FilteredSelection (image analysis disabled)`);
      products = await db.filteredSelection.findMany({
        where,
        orderBy: { priorityScore: 'desc' }, // Use cached priority score from database
        take: maxProductsToScan > 0 ? maxProductsToScan : undefined,
      });
    }

    console.log(`✅ Fetched ${products.length} products, pre-sorted by cached priority scores`);

    // Map to CachedProduct format
    let cachedProducts = products.map(p => ({
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
      // Image analysis fields (will be empty arrays/undefined for FilteredSelection)
      detectedColors: (p as any).detectedColors || [],
      colorSeasons: (p as any).colorSeasons || [],
      silhouetteType: (p as any).silhouetteType || undefined,
      styleClassification: (p as any).styleClassification || [],
      fabricTexture: (p as any).fabricTexture || undefined,
      designDetails: (p as any).designDetails || [],
      patternType: (p as any).patternType || undefined,
    }));

    // Apply gender filter if specified
    if (gender) {
      const beforeGenderFilter = cachedProducts.length;
      cachedProducts = filterProductsByGender(cachedProducts, gender);
      console.log(`✓ Gender filter (${gender}): ${beforeGenderFilter} → ${cachedProducts.length} products`);
    }

    return cachedProducts;
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
  geminiSettings?: any,
  valuesPreferences?: {
    sustainability: boolean;
    budgetRange?: string;
    styles: string[];
  }
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

  // Build gender and age-specific instructions
  let genderAgeInstructions = "";
  if (measurements?.gender) {
    if (measurements.gender === "man") {
      genderAgeInstructions += "\n\nGENDER-SPECIFIC REQUIREMENTS:\n- ONLY recommend products designed for MEN (men's clothing, menswear)\n- DO NOT recommend women's clothing, dresses, skirts, or feminine items\n- Focus on men's fashion categories: shirts, pants, suits, jackets, ties, etc.";
    } else if (measurements.gender === "woman") {
      genderAgeInstructions += "\n\nGENDER-SPECIFIC REQUIREMENTS:\n- ONLY recommend products designed for WOMEN (women's clothing)\n- DO NOT recommend men's clothing or masculine items unless specifically unisex/gender-neutral\n- Focus on women's fashion categories: dresses, tops, skirts, pants, blouses, etc.";
    } else {
      genderAgeInstructions += "\n\nGENDER-SPECIFIC REQUIREMENTS:\n- Recommend gender-neutral and versatile pieces\n- Focus on unisex styles that work across different fashion expressions";
    }
  }

  if (measurements?.age) {
    const age = parseInt(measurements.age);
    if (age < 25) {
      genderAgeInstructions += "\n- AGE CONSIDERATION: Younger customer - suggest trendy, contemporary styles appropriate for their age";
    } else if (age < 40) {
      genderAgeInstructions += "\n- AGE CONSIDERATION: Young professional - balance trendy and classic styles, workplace-appropriate options";
    } else if (age < 60) {
      genderAgeInstructions += "\n- AGE CONSIDERATION: Mature professional - sophisticated, timeless pieces with modern touches";
    } else {
      genderAgeInstructions += "\n- AGE CONSIDERATION: Mature customer - elegant, comfortable, age-appropriate styling with quality focus";
    }
  }

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

  // Build values preferences section
  let valuesInfo = "";
  if (valuesPreferences) {
    const parts: string[] = [];

    if (valuesPreferences.sustainability) {
      parts.push("- Sustainability: Customer values sustainable and eco-friendly fashion. Prioritize products with sustainable materials, ethical production, or eco-conscious brands.");
    }

    if (valuesPreferences.budgetRange) {
      parts.push(`- Budget Range: ${valuesPreferences.budgetRange}. Consider price points that fit within this range.`);
    }

    if (valuesPreferences.styles && valuesPreferences.styles.length > 0) {
      parts.push(`- Style Preferences: ${valuesPreferences.styles.join(", ")}. Prioritize products that match these style categories.`);
    }

    if (parts.length > 0) {
      valuesInfo = `\n\nCustomer Values & Preferences:\n${parts.join("\n")}`;
    }
  }

  // Use custom systemPrompt from settings, or fall back to default
  const systemPrompt = geminiSettings?.systemPrompt || DEFAULT_GEMINI_RECOMMENDATION_PROMPT;

  return `${systemPrompt}

${measurementInfo}${genderAgeInstructions}

Body Shape: ${bodyShape}
Style Guidance: ${guidance}${colorSeasonInfo}${valuesInfo}

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
- **sizeAdvice**: Look at the product's "description" and "availableSizes" fields to provide SPECIFIC size recommendations. If sizing info is in description (e.g., "fits true to size", "runs small", size charts), include that in your advice. Base size recommendations on customer's measurements.
- **stylingTip**: A unique, actionable styling suggestion for THIS SPECIFIC product

CRITICAL RULES:
- MUST return EXACTLY ${limit} products - not less, not more
- NO DUPLICATE PRODUCTS - each index must appear only once
- Each product MUST have unique reasoning and styling tips
- Don't be too strict with scoring - a score of 65-75 means "good match", 75-85 means "great match", 85+ means "excellent match"
- Use the cached visualAnalysis data to make informed recommendations
- Provide personalized advice, not generic tips
- Prioritize variety across different product types (tops, bottoms, dresses, accessories)
- STRICTLY follow gender-specific requirements above - do NOT recommend products for the wrong gender

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
  onlyInStock: boolean,
  gender?: string
): Promise<ProductRecommendation[]> {
  try {
    const products = await fetchCachedProducts(shop, onlyInStock, 0, gender);
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
