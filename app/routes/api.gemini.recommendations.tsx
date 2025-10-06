import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Public API for storefront - uses Gemini to analyze products
export async function action({ request }: ActionFunctionArgs) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const bodyData = await request.json();
    const bodyShape = bodyData.bodyShape;
    const products = bodyData.products || [];
    const measurements = bodyData.measurements;

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers });
    }

    if (products.length === 0) {
      return json({ error: "No products provided" }, { status: 400, headers });
    }

    // Prepare products for AI (limit data size)
    const productsForAI = products.slice(0, 50).map((p: any, index: number) => ({
      index,
      title: p.title,
      description: (p.description || "").substring(0, 150),
      productType: p.productType || "",
      tags: Array.isArray(p.tags) ? p.tags.join(", ") : "",
      price: p.price || "N/A"
    }));

    // Build prompt
    const prompt = buildPrompt(bodyShape, measurements, productsForAI);

    // Call Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse response
    const recommendations = parseResponse(text, products);

    return json({ recommendations: recommendations.slice(0, 12) }, { headers });
  } catch (error) {
    console.error("Error in Gemini API:", error);
    return json(
      { error: "Failed to get AI recommendations" },
      { status: 500, headers }
    );
  }
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

TASK: Analyze each product and intelligently select the top 12 that will:
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
- **index**: Product index from list (0-based)
- **score**: Suitability score (0-100)
- **reasoning**: WHY this specific product flatters ${bodyShape} (mention specific design elements: neckline, cut, silhouette, fabric flow)
- **sizeAdvice**: Precise sizing guidance for their body shape
- **stylingTip**: Unique, actionable styling tip that enhances this product for their shape (be specific: "Pair with X", "Wear with Y", "Add Z")

RULES:
- Only recommend score ≥ 50
- Prioritize variety (mix tops, bottoms, dresses, outerwear)
- Avoid products that emphasize problem areas
- Be specific and personalized

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

    for (const rec of parsed.recommendations || []) {
      const idx = rec.index;
      if (idx >= 0 && idx < products.length) {
        recommendations.push({
          ...products[idx],
          match: rec.score,
          reasoning: rec.reasoning || "Recommended by AI stylist",
          sizeAdvice: rec.sizeAdvice || "Check size chart",
          stylingTip: rec.stylingTip || ""
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    return [];
  }
}

export async function loader() {
  return json({ error: "Use POST method" }, { status: 405 });
}
