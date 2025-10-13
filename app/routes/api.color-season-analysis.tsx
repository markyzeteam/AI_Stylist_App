import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function action({ request }: ActionFunctionArgs) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await request.json();
    const { colorSeason, colorAnalysis } = body;

    if (!colorSeason) {
      return json({ error: "Color season required" }, { status: 400, headers });
    }

    console.log(`Getting Claude AI color season analysis for ${colorSeason}`);

    // Build context about color analysis
    let analysisContext = "";
    if (colorAnalysis) {
      const { undertone, depth, intensity } = colorAnalysis;
      analysisContext = `

Customer color characteristics:
- Skin undertone: ${undertone || "not specified"}
- Depth: ${depth || "not specified"}
- Intensity: ${intensity || "not specified"}`;
    }

    const prompt = `You are an expert color analyst and fashion stylist. A customer has been identified as having a "${colorSeason}" skin color season.${analysisContext}

Please provide a detailed, personalized color analysis for this season. Your response should be comprehensive and insightful, helping the customer understand:

1. **Color Season Analysis**: Explain what makes this color season unique and its key characteristics
2. **Best Colors**: The most flattering colors for this season
3. **Color Palette by Category**: Organize colors into neutrals, accent colors, and statement colors with reasoning
4. **Colors to Avoid**: Which colors might not be as flattering and why
5. **Styling Tips**: Practical advice for incorporating these colors into their wardrobe

Format your response as a JSON object with this structure:
{
  "analysis": "Detailed explanation of this color season and its characteristics (2-3 paragraphs)",
  "bestColors": ["Color 1", "Color 2", "Color 3", "Color 4", "Color 5"],
  "colorPalette": [
    {
      "category": "Category name (e.g., Neutrals, Accent Colors, Statement Colors)",
      "colors": ["Specific color 1", "Specific color 2", "Specific color 3"],
      "reasoning": "Detailed explanation of why these colors work well (1-2 sentences)"
    }
  ],
  "avoidColors": [
    {
      "color": "Color to avoid",
      "reason": "Why this color may not be flattering"
    }
  ],
  "stylingTips": ["Styling tip 1", "Styling tip 2", "Styling tip 3", "Styling tip 4"]
}

Make your recommendations specific, practical, and empowering. Focus on helping the customer feel confident in their color choices.`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from the response (Claude might wrap it in markdown code blocks)
    let jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      jsonMatch = responseText.match(/```\n([\s\S]*?)\n```/);
    }

    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    const analysis = JSON.parse(jsonText);

    console.log("✓ Got Claude AI color season analysis");

    return json({
      success: true,
      colorSeason,
      analysis,
    }, { headers });

  } catch (error: any) {
    console.error("Error getting Claude AI color season analysis:", error);
    return json(
      {
        error: "Failed to get color season analysis",
        message: error?.message || "Unknown error",
      },
      { status: 500, headers }
    );
  }
}
