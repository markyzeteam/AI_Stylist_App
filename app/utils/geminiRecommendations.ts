import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { fetchProducts, type Product, type ProductRecommendation } from "./productRecommendations";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function getGeminiProductRecommendations(
  admin: AdminApiContext,
  bodyShape: string,
  measurements?: {
    gender: string;
    age: string;
    bust: number;
    waist: number;
    hips: number;
    shoulders: number;
  },
  limit: number = 12
): Promise<ProductRecommendation[]> {
  try {
    // Fetch all products from store
    const products = await fetchProducts(admin);

    if (products.length === 0) {
      return [];
    }

    // Pre-filter products using basic heuristics to reduce API load
    // This helps Gemini focus on more relevant products
    const relevantProducts = preFilterProducts(products, bodyShape);

    console.log(`Pre-filtered ${products.length} products down to ${relevantProducts.length} relevant items for ${bodyShape}`);

    // Prepare product data for Gemini
    const productsForAI = relevantProducts.map((p, index) => ({
      index,
      title: p.title,
      description: p.description.substring(0, 200), // Limit description length
      productType: p.productType,
      tags: p.tags.join(", "),
      price: p.variants[0]?.price || "N/A"
    }));

    // Build the prompt for Gemini
    const prompt = buildGeminiPrompt(bodyShape, measurements, productsForAI, limit);

    // Call Gemini API
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse Gemini's response
    const recommendations = parseGeminiResponse(text, relevantProducts);

    return recommendations.slice(0, limit);
  } catch (error) {
    console.error("Error getting Gemini recommendations:", error);
    // Fallback to algorithmic recommendations if Gemini fails
    const { getProductRecommendations } = await import("./productRecommendations");
    return getProductRecommendations(admin, bodyShape, limit);
  }
}

// Pre-filter products to focus Gemini AI on most relevant items
function preFilterProducts(products: Product[], bodyShape: string): Product[] {
  const avoidKeywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["tight-fit-bottom", "skinny-jean", "pencil-skirt"],
    "Apple/Round": ["tight-waist", "crop-top", "bodycon"],
    "Hourglass": ["oversized", "baggy", "shapeless"],
    "Inverted Triangle": ["shoulder-pad", "puff-sleeve", "statement-shoulder"],
    "Rectangle/Straight": ["straight-cut", "shift-dress"],
    "V-Shape/Athletic": ["heavily-structured-shoulder"],
    "Oval/Apple": ["tight-midsection", "bodycon"]
  };

  const avoid = avoidKeywords[bodyShape] || [];

  // Filter out products with clearly unsuitable characteristics
  return products.filter(product => {
    const productText = `${product.title} ${product.description} ${product.productType} ${product.tags.join(' ')}`.toLowerCase();

    // Remove products with avoid keywords
    const hasAvoidKeyword = avoid.some(keyword => productText.includes(keyword.toLowerCase()));
    if (hasAvoidKeyword) return false;

    return true;
  });
}

function buildGeminiPrompt(
  bodyShape: string,
  measurements: any,
  products: any[],
  limit: number
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

  // Define body shape specific guidance for Gemini
  const bodyShapeGuidance = {
    "Pear/Triangle": "Focus on balancing wider hips with structured shoulders, A-line silhouettes, and drawing attention upward. Avoid tight bottoms.",
    "Apple/Round": "Emphasize defined waist with empire cuts, V-necks, and flowing fabrics. Create vertical lines. Avoid tight waistbands.",
    "Hourglass": "Highlight curves with fitted styles, wrap designs, and belted pieces. Avoid shapeless or overly loose clothing.",
    "Inverted Triangle": "Balance broad shoulders with A-line skirts, wide-leg pants, and minimize shoulder details. Avoid shoulder pads.",
    "Rectangle/Straight": "Create curves with belts, peplum, and structured pieces. Add dimension through layering. Avoid straight cuts.",
    "V-Shape/Athletic": "Show off athletic build with fitted shirts and straight-leg pants. Minimize shoulder emphasis.",
    "Oval/Apple": "Use vertical lines, open layers, and darker colors on torso. Avoid tight-fitting around midsection."
  };

  const guidance = bodyShapeGuidance[bodyShape as keyof typeof bodyShapeGuidance] || "Consider proportions and personal style.";

  return `You are an expert fashion stylist and personal shopper with deep knowledge of body proportions and style optimization. Your goal is to select products that will genuinely flatter the customer's body shape.

${measurementInfo}

Body Shape: ${bodyShape}
Style Guidance: ${guidance}

Products Available:
${JSON.stringify(products, null, 2)}

TASK: Act as an intelligent recommendation algorithm. Analyze each product deeply and select the top ${limit} products that will:
1. **Flatter the ${bodyShape} body shape** based on cut, silhouette, and design details
2. **Fit their proportions** considering their specific measurements
3. **Look modern and stylish** with current fashion trends
4. **Solve their specific body shape challenges** (e.g., balance proportions, create definition, elongate silhouette)

For each recommendation, provide:
- **index**: Product index from the list (0-based)
- **score**: Suitability score (0-100) where 100 = perfect match, 70-90 = great, 50-69 = good, <50 = skip
- **reasoning**: Explain WHY this specific product flatters their ${bodyShape} body shape (2-3 sentences, be specific about design elements like neckline, cut, fit, fabric)
- **sizeAdvice**: Specific sizing guidance for their body shape and proportions
- **stylingTip**: A unique, actionable styling suggestion that enhances how this product works with their body shape

CRITICAL RULES:
- Only recommend products with score ≥ 50
- Be very selective - prioritize quality over quantity
- Consider the entire outfit composition (tops, bottoms, dresses, outerwear)
- Avoid products that would emphasize problem areas for this body shape
- Provide specific, personalized advice (not generic tips)

Format your response as valid JSON (no markdown, no extra text):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "This A-line dress features a fitted bodice and flared skirt that perfectly balances wider hips with defined waist, creating an hourglass silhouette. The V-neckline draws attention upward, and the structured shoulders add balance.",
      "sizeAdvice": "Choose based on hip measurement - you may need to size up and have the waist tailored for a perfect fit",
      "stylingTip": "Pair with pointed-toe heels to elongate legs and a cropped jacket to emphasize your waist"
    }
  ]
}

Return ONLY the JSON array, no other text.`;
}

function parseGeminiResponse(text: string, products: Product[]): ProductRecommendation[] {
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
    console.error("Error parsing Gemini response:", error);
    console.error("Raw response:", text);
    return [];
  }
}

function determineCategory(product: Product): string {
  const text = `${product.title} ${product.description} ${product.productType}`.toLowerCase();

  if (text.includes("dress")) return "dresses";
  if (text.includes("top") || text.includes("shirt") || text.includes("blouse")) return "tops";
  if (text.includes("pant") || text.includes("jean") || text.includes("trouser")) return "bottoms";

  return "general";
}
