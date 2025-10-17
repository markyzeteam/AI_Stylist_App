import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadGeminiSettings } from "../utils/geminiAnalysis";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Use POST method" }, { status: 405, headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { bodyShape, measurements, shop } = body;

    if (!bodyShape) {
      return json({ error: "Body shape required" }, { status: 400, headers: corsHeaders });
    }

    if (!shop) {
      return json({ error: "Shop parameter required" }, { status: 400, headers: corsHeaders });
    }

    console.log(`Getting Gemini AI style analysis for ${bodyShape}`);

    // Load Gemini settings from database (includes custom API key if set)
    const geminiSettings = await loadGeminiSettings(shop);

    // Use custom API key from database, or fall back to environment variable
    const apiKey = geminiSettings.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY not set in database or environment");
      return json({ error: "API key not configured" }, { status: 500, headers: corsHeaders });
    }

    // Create Gemini client with API key
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiSettings.model || "gemini-2.0-flash-exp" });

    // Build context about measurements if available
    let measurementContext = "";
    if (measurements) {
      const { gender, age, bust, waist, hips, shoulders } = measurements;
      measurementContext = `

Customer measurements:
- Gender: ${gender || "not specified"}
- Age range: ${age || "not specified"}
- Bust/Chest: ${bust || "not specified"} cm
- Waist: ${waist || "not specified"} cm
- Hips: ${hips || "not specified"} cm
- Shoulders: ${shoulders || "not specified"} cm`;
    }

    const prompt = `You are an expert fashion stylist and personal shopper. A customer has been identified as having a "${bodyShape}" body shape.${measurementContext}

Please provide detailed, personalized style recommendations for this body shape. Your response should be comprehensive and insightful, helping the customer understand:

1. **Body Shape Analysis**: Explain what makes this body shape unique and its key characteristics
2. **Style Goals**: What styling strategies work best for this body shape and why
3. **Recommended Clothing Types**: Specific clothing items and styles that flatter this body shape
4. **Styling Tips**: Practical advice for putting together outfits
5. **What to Avoid**: Items or styles that may not be as flattering

Format your response as a JSON object with this structure:
{
  "analysis": "Detailed explanation of this body shape and its characteristics (2-3 paragraphs)",
  "styleGoals": ["Goal 1", "Goal 2", "Goal 3"],
  "recommendations": [
    {
      "category": "Category name (e.g., Dresses, Tops, Bottoms)",
      "items": ["Specific item 1", "Specific item 2", "Specific item 3"],
      "reasoning": "Detailed explanation of why these items work well (1-2 sentences)",
      "stylingTips": "Specific tips for wearing these items"
    }
  ],
  "avoidItems": [
    {
      "item": "Item to avoid",
      "reason": "Why it may not be flattering"
    }
  ],
  "proTips": ["Pro tip 1", "Pro tip 2", "Pro tip 3"]
}

Make your recommendations specific, practical, and empowering. Focus on helping the customer feel confident in their style choices.`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: "application/json"
      }
    });

    const responseText = result.response.text();
    const analysis = JSON.parse(responseText);

    console.log("✓ Got Gemini AI style analysis");

    return json({
      success: true,
      bodyShape,
      analysis,
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("Error getting Gemini AI style analysis:", error);
    return json(
      {
        error: "Failed to get style analysis",
        message: error?.message || "Unknown error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
