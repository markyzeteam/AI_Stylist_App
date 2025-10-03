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

    // Prepare product data for Gemini
    const productsForAI = products.map((p, index) => ({
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
    const recommendations = parseGeminiResponse(text, products);

    return recommendations.slice(0, limit);
  } catch (error) {
    console.error("Error getting Gemini recommendations:", error);
    // Fallback to algorithmic recommendations if Gemini fails
    const { getProductRecommendations } = await import("./productRecommendations");
    return getProductRecommendations(admin, bodyShape, limit);
  }
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

  return `You are an expert fashion stylist and personal shopper. Analyze these products and recommend the best ones for a customer with a ${bodyShape} body shape.

${measurementInfo}

Body Shape: ${bodyShape}

Products to analyze:
${JSON.stringify(products, null, 2)}

Instructions:
1. Analyze each product's title, description, type, and tags
2. Consider which styles would flatter a ${bodyShape} body shape
3. Recommend the top ${limit} products that would look best
4. For each recommendation, provide:
   - Product index number (from the list above)
   - Suitability score (0-100)
   - Brief reasoning (1-2 sentences why it suits this body shape)
   - Specific size advice for this body shape

Format your response EXACTLY as JSON (no markdown, no extra text):
{
  "recommendations": [
    {
      "index": 0,
      "score": 95,
      "reasoning": "This A-line dress perfectly flatters pear shapes by balancing proportions...",
      "sizeAdvice": "Choose based on hip measurement, may need to size up"
    }
  ]
}

Return ONLY the JSON, no other text.`;
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
          category: determineCategory(product)
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
