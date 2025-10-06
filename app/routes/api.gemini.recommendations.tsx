import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

// Handle OPTIONS preflight requests
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Use POST method" }, { status: 405, headers: corsHeaders });
}

// Public API for storefront - uses Gemini to analyze products
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const bodyData = await request.json();
    const bodyShape = bodyData.bodyShape;
    const products = bodyData.products || [];
    const measurements = bodyData.measurements;

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers: corsHeaders });
    }

    if (products.length === 0) {
      return json({ error: "No products provided" }, { status: 400, headers: corsHeaders });
    }

    // Filter out sold out products and prepare for AI
    const availableProducts = products.filter((p: any) => {
      // Check if product has at least one available variant
      if (p.variants && Array.isArray(p.variants)) {
        return p.variants.some((v: any) => v.available === true || v.availableForSale === true);
      }
      // If no variants info, assume available
      return p.available !== false;
    });

    console.log(`[Gemini API] Processing ${availableProducts.length} available products for ${bodyShape}`);

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error("[Gemini API] No API key configured, using fallback");
      const fallbackRecs = fallbackRecommendations(availableProducts, bodyShape);
      return json({ recommendations: fallbackRecs.slice(0, 12) }, { headers: corsHeaders });
    }

    // Prepare products for AI (limit data size)
    const productsForAI = availableProducts.slice(0, 50).map((p: any, index: number) => ({
      index,
      title: p.title,
      description: (p.description || "").substring(0, 150),
      productType: p.productType || "",
      tags: Array.isArray(p.tags) ? p.tags.join(", ") : "",
      price: p.price || "N/A"
    }));

    // Build prompt
    const prompt = buildPrompt(bodyShape, measurements, productsForAI);

    // Call Gemini with timeout
    console.log(`[Gemini API] Calling Gemini AI...`);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log(`[Gemini API] Received response (${text.length} chars), parsing...`);

    // Parse response
    const recommendations = parseResponse(text, availableProducts);

    if (recommendations.length === 0) {
      console.log(`[Gemini API] No valid recommendations from AI, using fallback`);
      const fallbackRecs = fallbackRecommendations(availableProducts, bodyShape);
      return json({ recommendations: fallbackRecs.slice(0, 12) }, { headers: corsHeaders });
    }

    console.log(`[Gemini API] Returning ${recommendations.length} recommendations`);

    return json({ recommendations: recommendations.slice(0, 12) }, { headers: corsHeaders });
  } catch (error) {
    console.error("[Gemini API] Error:", error);
    console.error("[Gemini API] Error details:", error instanceof Error ? error.message : "Unknown error");

    // Try to get products list for fallback
    try {
      const bodyData = await request.clone().json();
      const products = bodyData.products || [];
      const bodyShape = bodyData.bodyShape;

      if (products.length > 0) {
        console.log("[Gemini API] Using fallback algorithm due to error");
        const availableProducts = products.filter((p: any) => {
          if (p.variants && Array.isArray(p.variants)) {
            return p.variants.some((v: any) => v.available === true || v.availableForSale === true);
          }
          return p.available !== false;
        });
        const fallbackRecs = fallbackRecommendations(availableProducts, bodyShape);
        return json({ recommendations: fallbackRecs.slice(0, 12) }, { headers: corsHeaders });
      }
    } catch (fallbackError) {
      console.error("[Gemini API] Fallback also failed:", fallbackError);
    }

    return json(
      {
        error: "Failed to get AI recommendations",
        details: error instanceof Error ? error.message : "Unknown error",
        recommendations: []
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Fallback recommendation algorithm
function fallbackRecommendations(products: any[], bodyShape: string): any[] {
  const bodyShapeKeywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["a-line", "fit-and-flare", "empire", "bootcut", "wide-leg", "structured", "top", "blouse"],
    "Apple/Round": ["empire", "v-neck", "scoop", "high-waist", "flow", "wrap", "tunic", "dress"],
    "Hourglass": ["fitted", "wrap", "belt", "high-waist", "curve", "bodycon", "dress"],
    "Inverted Triangle": ["a-line", "wide-leg", "bootcut", "scoop", "v-neck", "skirt", "pant"],
    "Rectangle/Straight": ["belt", "peplum", "structure", "layer", "crop", "fitted"],
    "V-Shape/Athletic": ["fitted", "straight-leg", "v-neck", "minimal", "athletic", "casual"]
  };

  const keywords = bodyShapeKeywords[bodyShape] || [];

  const scored = products.map((product, index) => {
    const text = `${product.title} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

    let score = 50;
    keywords.forEach(kw => {
      if (text.includes(kw.toLowerCase())) {
        score += 10;
      }
    });

    return {
      ...product,
      match: Math.min(100, score),
      reasoning: `This style complements ${bodyShape} body shape with its flattering cut and design`,
      sizeAdvice: `Size according to your measurements - this works well for ${bodyShape} shapes`,
      stylingTip: getRandomStylingTip(product, bodyShape)
    };
  });

  return scored
    .filter(p => p.match >= 50)
    .sort((a, b) => b.match - a.match)
    .slice(0, 12);
}

function getRandomStylingTip(product: any, bodyShape: string): string {
  const tips: { [key: string]: string[] } = {
    "Pear/Triangle": [
      "Pair with a statement necklace to draw attention upward",
      "Add a structured blazer to balance proportions",
      "Style with pointed-toe heels to elongate legs"
    ],
    "Inverted Triangle": [
      "Wear with wide-leg pants to balance broader shoulders",
      "Add a belt to create waist definition",
      "Pair with A-line bottoms for proportion"
    ],
    "Hourglass": [
      "Belt at the waist to emphasize your curves",
      "Pair with fitted pieces to showcase your shape",
      "Add high heels to elongate your silhouette"
    ],
    "Rectangle/Straight": [
      "Layer with a belt to create curves",
      "Add a peplum top for waist definition",
      "Wear with structured pieces to add dimension"
    ],
    "Apple/Round": [
      "Style with flowing layers for a flattering drape",
      "Pair with high-waisted bottoms to define waist",
      "Add a long necklace to create vertical lines"
    ],
    "V-Shape/Athletic": [
      "Pair with straight-cut pants for balance",
      "Add minimal accessories for clean lines",
      "Style with fitted basics to show your shape"
    ]
  };

  const shapeTips = tips[bodyShape] || ["Style according to your personal preference"];
  return shapeTips[Math.floor(Math.random() * shapeTips.length)];
}

function buildPrompt(bodyShape: string, measurements: any, products: any[]): string {
  const measurementInfo = measurements
    ? `
Customer Details:
- Gender: ${measurements.gender || "N/A"}
- Age: ${measurements.age || "N/A"}
- Body Shape: ${bodyShape}
- Bust: ${measurements.bust || "N/A"}cm
- Waist: ${measurements.waist || "N/A"}cm
- Hips: ${measurements.hips || "N/A"}cm
`
    : `Body Shape: ${bodyShape}`;

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

  return `You are an expert fashion stylist and personal shopper with deep knowledge of body proportions and flattering styles. Your role is to act as an intelligent product recommendation algorithm.

${measurementInfo}

Style Guidance for ${bodyShape}: ${guidance}

Available Products:
${JSON.stringify(products, null, 2)}

TASK: Analyze each product and intelligently select the top 12 DIFFERENT products that will:
1. **Genuinely flatter** the ${bodyShape} body shape (consider cut, silhouette, neckline, fit)
2. **Balance their proportions** using the measurements provided
3. **Solve body shape challenges** (create curves, elongate, balance, define)
4. **Look stylish** with current fashion trends

Scoring Criteria:
- 90-100: Perfect match, addresses body shape needs perfectly
- 70-89: Great choice, flatters well
- 50-69: Good option, suitable with styling
- <50: Skip this product

For each recommendation provide:
- **index**: Product index from list (0-based) - MUST be unique, NO DUPLICATES
- **score**: Suitability score (0-100)
- **reasoning**: WHY this specific product flatters ${bodyShape} (mention specific design elements: neckline, cut, silhouette, fabric flow) - MUST be unique for each product
- **sizeAdvice**: Precise sizing guidance for their body shape
- **stylingTip**: Unique, actionable styling tip that enhances THIS SPECIFIC product for their shape (be specific: "Pair with X", "Wear with Y", "Add Z") - MUST be different for each product

CRITICAL RULES:
- NO DUPLICATE PRODUCTS - each index must appear only once
- Each product MUST have unique reasoning and styling tips
- Only recommend score ≥ 50
- Prioritize variety (mix tops, bottoms, dresses, outerwear)
- Avoid products that emphasize problem areas
- Be specific and personalized for EACH product

Respond with ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "This A-line dress features a fitted bodice that defines the waist and flared skirt that balances proportions, perfect for creating an hourglass effect. The V-neckline draws eyes upward.",
      "sizeAdvice": "Size based on your hip measurement, consider sizing up for comfort",
      "stylingTip": "Pair with pointed-toe heels and a cropped denim jacket to emphasize your waist"
    }
  ]
}`;
}

function parseResponse(text: string, products: any[]): any[] {
  try {
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const parsed = JSON.parse(jsonText);
    const recommendations: any[] = [];
    const seenIndices = new Set<number>(); // Track which product indices we've used

    for (const rec of parsed.recommendations || []) {
      const idx = rec.index;

      // Skip if we've already added this product (deduplication)
      if (seenIndices.has(idx)) {
        console.log(`[Gemini API] Skipping duplicate product at index ${idx}`);
        continue;
      }

      if (idx >= 0 && idx < products.length) {
        seenIndices.add(idx);
        recommendations.push({
          ...products[idx],
          match: rec.score,
          reasoning: rec.reasoning || "Recommended by AI stylist",
          sizeAdvice: rec.sizeAdvice || "Check size chart",
          stylingTip: rec.stylingTip || ""
        });
      }
    }

    console.log(`[Gemini API] Parsed ${recommendations.length} unique recommendations from ${parsed.recommendations?.length || 0} total`);

    return recommendations;
  } catch (error) {
    console.error("[Gemini API] Error parsing response:", error);
    console.error("[Gemini API] Raw text:", text.substring(0, 500));
    return [];
  }
}
