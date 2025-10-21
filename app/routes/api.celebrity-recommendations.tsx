import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { retryWithBackoff } from "../utils/geminiAnalysis";

/**
 * CELEBRITY STYLE RECOMMENDATIONS API
 *
 * Uses Gemini to suggest celebrities that match the user's:
 * - Body shape
 * - Color season
 * - Shopping preferences
 */

export async function loader({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const bodyShape = url.searchParams.get("bodyShape");
  const colorSeason = url.searchParams.get("colorSeason");
  const styles = url.searchParams.get("styles"); // comma-separated

  if (!bodyShape) {
    return json({ error: "Body shape is required" }, { status: 400 });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Build comprehensive prompt for celebrity recommendations
    const prompt = `You are a professional fashion stylist. Recommend 3-4 celebrities who have the following characteristics:

Body Shape: ${bodyShape}
${colorSeason ? `Color Season: ${colorSeason}` : ''}
${styles ? `Style Preferences: ${styles}` : ''}

For each celebrity, provide:
1. Name
2. Why they're a good style match (body shape and color season compatibility)
3. 2-3 specific styling tips inspired by their signature looks
4. Key wardrobe pieces they often wear that would work well

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "summary": "A brief 2-3 sentence overview of the user's unique style profile combining their body shape${colorSeason ? ', color season' : ''}${styles ? ', and style preferences' : ''}.",
  "celebrities": [
    {
      "name": "Celebrity Full Name",
      "matchReason": "Detailed explanation of why this celebrity matches (mention body shape${colorSeason ? ' and color season' : ''})",
      "stylingTips": [
        "Specific styling tip 1",
        "Specific styling tip 2",
        "Specific styling tip 3"
      ],
      "signaturePieces": [
        "Wardrobe piece 1",
        "Wardrobe piece 2",
        "Wardrobe piece 3"
      ],
      "imageSearchQuery": "Celebrity Name red carpet fashion"
    }
  ]
}`;

    console.log(`🎬 Getting celebrity recommendations for ${bodyShape}${colorSeason ? ` / ${colorSeason}` : ''}`);

    // Call Gemini with retry logic
    const result = await retryWithBackoff(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      })
    );

    const response = await result.response;
    const text = response.text();

    // Parse response
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      return json({ error: "Invalid response from AI" }, { status: 500 });
    }

    console.log(`✅ Got ${data.celebrities?.length || 0} celebrity recommendations`);

    return json({
      success: true,
      data: {
        summary: data.summary,
        celebrities: data.celebrities || [],
        userProfile: {
          bodyShape,
          colorSeason,
          styles: styles ? styles.split(',') : []
        }
      }
    });

  } catch (error: any) {
    console.error("Error getting celebrity recommendations:", error);
    return json({
      error: "Failed to get celebrity recommendations",
      message: error.message
    }, { status: 500 });
  }
}
