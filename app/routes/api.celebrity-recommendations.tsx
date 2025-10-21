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

    // Check if it's a Gemini overload error (503)
    const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');

    if (isOverloaded) {
      console.log("⚠️ Gemini API is overloaded, returning fallback celebrity recommendations");

      // Return fallback recommendations based on body shape
      const fallbackData = getFallbackCelebrityRecommendations(bodyShape, colorSeason, styles);

      return json({
        success: true,
        fallback: true,
        data: fallbackData
      });
    }

    // For other errors, return error response
    return json({
      error: "Failed to get celebrity recommendations",
      message: error.message
    }, { status: 500 });
  }
}

/**
 * Fallback celebrity recommendations when Gemini API is unavailable
 */
function getFallbackCelebrityRecommendations(
  bodyShape: string | null,
  colorSeason: string | null,
  styles: string | null
): any {
  const stylesList = styles ? styles.split(',') : [];

  // Generic fallback summary
  const summary = `Your ${bodyShape || 'unique'} body shape${colorSeason ? ` with ${colorSeason} coloring` : ''} creates a distinctive style profile${stylesList.length > 0 ? ` that aligns beautifully with ${stylesList.join(', ')} aesthetics` : ''}.`;

  // Generic celebrity recommendations (these work well for most body shapes)
  const celebrities = [
    {
      name: "Jennifer Aniston",
      matchReason: "Known for her timeless style that flatters many body types with classic, well-fitted pieces and versatile silhouettes.",
      stylingTips: [
        "Invest in well-fitted basics that can be dressed up or down",
        "Choose pieces that define the waist for a polished silhouette",
        "Layer strategically to create balanced proportions"
      ],
      signaturePieces: [
        "Tailored blazers",
        "Classic little black dress",
        "Well-fitted jeans"
      ],
      imageSearchQuery: "Jennifer Aniston casual chic style"
    },
    {
      name: "Lupita Nyong'o",
      matchReason: "Celebrated for her bold color choices and flattering silhouettes that work across different body shapes and seasons.",
      stylingTips: [
        "Don't be afraid to experiment with vibrant colors",
        "Look for pieces with interesting details that draw the eye",
        "Balance structured pieces with flowing fabrics"
      ],
      signaturePieces: [
        "Colorful statement dresses",
        "Structured tops",
        "Bold accessories"
      ],
      imageSearchQuery: "Lupita Nyongo red carpet fashion"
    },
    {
      name: "Blake Lively",
      matchReason: "Masters the art of dressing for any occasion with styles that flatter and enhance natural proportions.",
      stylingTips: [
        "Choose pieces that create vertical lines for an elongating effect",
        "Mix textures and patterns for visual interest",
        "Accessorize to draw attention to your best features"
      ],
      signaturePieces: [
        "Fit-and-flare dresses",
        "High-waisted bottoms",
        "Statement coats"
      ],
      imageSearchQuery: "Blake Lively street style fashion"
    }
  ];

  return {
    summary,
    celebrities,
    userProfile: {
      bodyShape,
      colorSeason,
      styles: stylesList
    }
  };
}
