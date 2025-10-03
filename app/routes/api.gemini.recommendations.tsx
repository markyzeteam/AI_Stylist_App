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

  return `You are an expert fashion stylist. Recommend the best products for this customer.

${measurementInfo}

Products:
${JSON.stringify(products, null, 2)}

Recommend the top 12 products that would:
1. Flatter their ${bodyShape} body shape
2. Fit their proportions well
3. Look stylish and modern

For each recommendation, provide:
- index: Product index from the list
- score: Suitability score (0-100)
- reasoning: Why it suits them (1-2 sentences)
- sizeAdvice: Specific size guidance
- stylingTip: A unique styling suggestion for THIS specific product and body shape (e.g., "Pair with a belt to define waist", "Style with wide-leg jeans", "Add statement earrings to balance proportions")

Respond with ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "This flatters your body shape because...",
      "sizeAdvice": "Size for your hips...",
      "stylingTip": "Pair this with a statement belt to accentuate your waist"
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
