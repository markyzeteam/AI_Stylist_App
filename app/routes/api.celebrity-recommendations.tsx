import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { retryWithBackoff, loadGeminiSettings } from "../utils/geminiAnalysis";

/**
 * CELEBRITY STYLE RECOMMENDATIONS API
 *
 * Uses Gemini to suggest celebrities that match the user's:
 * - Body shape
 * - Color season
 * - Shopping preferences
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  // Declare variables outside try block so they're accessible in catch
  let bodyShape: string | null = null;
  let colorSeason: string | null = null;
  let styles: string | null = null;
  let shop: string | null = null;
  let gender: string | null = null;
  let age: string | null = null;
  let height: string | null = null;
  let weight: string | null = null;
  let bust: string | null = null;
  let waist: string | null = null;
  let hips: string | null = null;
  let shoulders: string | null = null;

  try {
    const url = new URL(request.url);
    bodyShape = url.searchParams.get("bodyShape");
    colorSeason = url.searchParams.get("colorSeason");
    styles = url.searchParams.get("styles"); // comma-separated
    shop = url.searchParams.get("shop");

    // Get all measurements
    gender = url.searchParams.get("gender");
    age = url.searchParams.get("age");
    height = url.searchParams.get("height");
    weight = url.searchParams.get("weight");
    bust = url.searchParams.get("bust");
    waist = url.searchParams.get("waist");
    hips = url.searchParams.get("hips");
    shoulders = url.searchParams.get("shoulders");

    console.log(`INFO: Celebrity recommendations request: bodyShape=${bodyShape}, gender=${gender}, colorSeason=${colorSeason}, styles=${styles}, measurements={height:${height}, weight:${weight}}, shop=${shop}`);

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers: corsHeaders });
    }

    if (!shop) {
      return json({ error: "Shop parameter is required" }, { status: 400, headers: corsHeaders });
    }

    // Load Gemini settings from database (includes custom API key if set)
    const geminiSettings = await loadGeminiSettings(shop);

    // Use custom API key from database, or fall back to environment variable
    const apiKey = geminiSettings.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("ERROR: GEMINI_API_KEY not set in database or environment");
      return json({ error: "Gemini API key not configured" }, { status: 500, headers: corsHeaders });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Build comprehensive prompt for celebrity recommendations
    // Build measurements section
    let measurementsText = '';
    if (gender) measurementsText += `\nGender: ${gender}`;
    if (age) measurementsText += `\nAge: ${age}`;
    if (height) measurementsText += `\nHeight: ${height} cm`;
    if (weight) measurementsText += `\nWeight: ${weight} kg`;
    if (bust) measurementsText += `\nBust: ${bust} cm`;
    if (waist) measurementsText += `\nWaist: ${waist} cm`;
    if (hips) measurementsText += `\nHips: ${hips} cm`;
    if (shoulders) measurementsText += `\nShoulders: ${shoulders} cm`;

    // Build age-specific guidance
    let ageGuidance = '';
    if (age) {
      const ageNum = parseInt(age);
      if (ageNum < 25) {
        ageGuidance = '\n- AGE CONSIDERATION: Recommend contemporary style icons who appeal to younger demographics and showcase current trends';
      } else if (ageNum < 40) {
        ageGuidance = '\n- AGE CONSIDERATION: Recommend celebrities with versatile, professional styles that balance trendy and timeless elements';
      } else if (ageNum < 60) {
        ageGuidance = '\n- AGE CONSIDERATION: Recommend sophisticated celebrities known for elegant, mature styling with modern touches';
      } else {
        ageGuidance = '\n- AGE CONSIDERATION: Recommend classic, elegant style icons known for timeless, age-appropriate fashion';
      }
    }

    const prompt = `You are a professional fashion stylist. Recommend 3-4 celebrities who match this person's profile:

Body Shape: ${bodyShape}${measurementsText}
${colorSeason ? `Color Season: ${colorSeason}` : ''}
${styles ? `Style Preferences: ${styles}` : ''}

IMPORTANT REQUIREMENTS:
- GENDER: Recommend celebrities that match the person's gender (${gender || 'not specified'}). For example:
  * If gender is "man", recommend MALE celebrities only
  * If gender is "woman", recommend FEMALE celebrities only
  * If gender is "non-binary", recommend diverse style icons${ageGuidance}

For each celebrity, provide:
1. Name
2. Why they're a good style match (body shape, measurements, and color season compatibility)
3. 2-3 specific styling tips inspired by their signature looks
4. Key wardrobe pieces they often wear that would work well

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "summary": "A brief 2-3 sentence overview of the user's unique style profile combining their body shape${measurementsText ? ', measurements' : ''}${colorSeason ? ', color season' : ''}${styles ? ', and style preferences' : ''}.",
  "celebrities": [
    {
      "name": "Celebrity Full Name",
      "matchReason": "Detailed explanation of why this celebrity matches (mention body shape${measurementsText ? ', similar measurements' : ''}${colorSeason ? ', and color season' : ''})",
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

    console.log(`INFO: Getting celebrity recommendations for ${gender || 'unspecified gender'} with ${bodyShape} body shape${colorSeason ? ` / ${colorSeason}` : ''}`);

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
      return json({ error: "Invalid response from AI" }, { status: 500, headers: corsHeaders });
    }

    console.log(`INFO: Got ${data.celebrities?.length || 0} celebrity recommendations`);

    return json({
      success: true,
      data: {
        summary: data.summary,
        celebrities: data.celebrities || [],
        userProfile: {
          bodyShape,
          colorSeason,
          styles: styles ? styles.split(',') : [],
          gender,
          age,
          height,
          weight,
          bust,
          waist,
          hips,
          shoulders
        }
      }
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("ERROR: Error getting celebrity recommendations:", error);
    console.error("Error details:", {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      stack: error?.stack
    });

    // Check if it's a Gemini overload error (503)
    const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');

    if (isOverloaded) {
      console.log("WARNING: Gemini API is overloaded, returning fallback celebrity recommendations");

      // Return fallback recommendations based on body shape and measurements
      const fallbackData = getFallbackCelebrityRecommendations(
        bodyShape, colorSeason, styles, gender, age, height, weight, bust, waist, hips, shoulders
      );

      return json({
        success: true,
        fallback: true,
        data: fallbackData
      }, { headers: corsHeaders });
    }

    // For other errors, return error response
    return json({
      error: "Failed to get celebrity recommendations",
      message: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

/**
 * Fallback celebrity recommendations when Gemini API is unavailable
 */
function getFallbackCelebrityRecommendations(
  bodyShape: string | null,
  colorSeason: string | null,
  styles: string | null,
  gender: string | null,
  age: string | null,
  height: string | null,
  weight: string | null,
  bust: string | null,
  waist: string | null,
  hips: string | null,
  shoulders: string | null
): any {
  const stylesList = styles ? styles.split(',') : [];

  // Generic fallback summary
  const summary = `Your ${bodyShape || 'unique'} body shape${colorSeason ? ` with ${colorSeason} coloring` : ''} creates a distinctive style profile${stylesList.length > 0 ? ` that aligns beautifully with ${stylesList.join(', ')} aesthetics` : ''}.`;

  // Gender-appropriate celebrity recommendations
  let celebrities = [];

  // Determine age-appropriate celebrity selections
  const ageNum = age ? parseInt(age) : null;
  const isYoung = ageNum && ageNum < 30;
  const isMidAge = ageNum && ageNum >= 30 && ageNum < 50;
  const isMature = ageNum && ageNum >= 50;

  if (gender === 'man') {
    // Male celebrities - age-appropriate
    if (isYoung) {
      celebrities = [
        {
          name: "Timothée Chalamet",
          matchReason: "Contemporary style icon known for bold fashion choices and effortless cool that resonates with younger demographics.",
          stylingTips: [
            "Experiment with bold colors and unique silhouettes",
            "Mix high-end and vintage pieces for individual style",
            "Don't be afraid to break traditional menswear rules"
          ],
          signaturePieces: [
            "Statement blazers",
            "Designer sneakers",
            "Layered casual looks"
          ],
          imageSearchQuery: "Timothee Chalamet fashion style"
        },
        {
          name: "Michael B. Jordan",
          matchReason: "Masters contemporary athletic-luxe style with impeccable tailoring and modern edge.",
          stylingTips: [
            "Highlight athletic build with fitted, structured pieces",
            "Layer strategically for depth and interest",
            "Balance casual and dressed-up elements"
          ],
          signaturePieces: [
            "Fitted bomber jackets",
            "Tailored joggers",
            "Crisp white tees"
          ],
          imageSearchQuery: "Michael B Jordan style fashion"
        },
        {
          name: "Harry Styles",
          matchReason: "Breaks fashion boundaries with bold patterns and colors while maintaining impeccable fit and proportion.",
          stylingTips: [
            "Experiment with patterns and textures confidently",
            "Mix vintage and contemporary pieces",
            "Use statement accessories to personalize your look"
          ],
          signaturePieces: [
            "Patterned suits",
            "Vintage band tees",
            "Bold printed shirts"
          ],
          imageSearchQuery: "Harry Styles fashion style"
        }
      ];
    } else {
      celebrities = [
        {
          name: "Ryan Gosling",
          matchReason: "Known for his versatile style that works across casual and formal settings, with a keen eye for fit and proportion.",
          stylingTips: [
            "Invest in well-fitted basics like tailored shirts and quality denim",
            "Layer with structured jackets for a polished look",
            "Keep accessories minimal but meaningful"
          ],
          signaturePieces: [
            "Tailored blazers",
            "Classic white shirts",
            "Well-fitted dark jeans"
          ],
          imageSearchQuery: "Ryan Gosling style fashion"
        },
        {
          name: "Idris Elba",
          matchReason: "Masters both smart-casual and formal wear with confidence, emphasizing sharp tailoring and sophisticated color choices.",
          stylingTips: [
            "Choose structured pieces that enhance your silhouette",
            "Don't be afraid of bold colors in accessories",
            "Prioritize quality fabrics and proper tailoring"
          ],
          signaturePieces: [
            "Three-piece suits",
            "Leather jackets",
            "Designer sneakers"
          ],
          imageSearchQuery: "Idris Elba red carpet fashion"
        },
        {
          name: "George Clooney",
          matchReason: "Epitomizes timeless, sophisticated menswear with a focus on quality and classic styling.",
          stylingTips: [
            "Invest in classic, well-made pieces that last",
            "Stick to refined color palettes and quality fabrics",
            "Let fit and fabric quality speak for themselves"
          ],
          signaturePieces: [
            "Classic navy suits",
            "Cashmere sweaters",
            "Quality leather shoes"
          ],
          imageSearchQuery: "George Clooney style fashion"
        }
      ];
    }
  } else if (gender === 'woman') {
    // Female celebrities
    celebrities = [
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
  } else {
    // Non-binary or diverse style icons
    celebrities = [
      {
        name: "Janelle Monáe",
        matchReason: "Known for bold, androgynous style that challenges traditional fashion norms with confidence and creativity.",
        stylingTips: [
          "Mix traditionally masculine and feminine pieces",
          "Use black and white as a foundation, adding pops of color",
          "Embrace structured silhouettes that work for any body"
        ],
        signaturePieces: [
          "Tailored tuxedos",
          "Statement accessories",
          "Bold monochrome looks"
        ],
        imageSearchQuery: "Janelle Monae fashion style"
      },
      {
        name: "Tilda Swinton",
        matchReason: "Masters avant-garde and minimalist styles with an emphasis on unique silhouettes and artistic expression.",
        stylingTips: [
          "Experiment with unconventional cuts and draping",
          "Keep color palettes refined and intentional",
          "Choose quality over quantity with investment pieces"
        ],
        signaturePieces: [
          "Architectural coats",
          "Minimalist separates",
          "Statement eyewear"
        ],
        imageSearchQuery: "Tilda Swinton fashion red carpet"
      },
      {
        name: "Billy Porter",
        matchReason: "Fearlessly blends fashion elements to create show-stopping looks that celebrate individuality and self-expression.",
        stylingTips: [
          "Don't shy away from dramatic statements",
          "Mix textures, patterns, and unexpected combinations",
          "Use fashion as a form of personal storytelling"
        ],
        signaturePieces: [
          "Gender-fluid gowns",
          "Bold suits with flair",
          "Statement headpieces"
        ],
        imageSearchQuery: "Billy Porter red carpet fashion"
      }
    ];
  }

  return {
    summary,
    celebrities,
    userProfile: {
      bodyShape,
      colorSeason,
      styles: stylesList,
      gender,
      age,
      height,
      weight,
      bust,
      waist,
      hips,
      shoulders
    }
  };
}
