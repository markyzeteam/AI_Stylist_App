import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadGeminiSettings, retryWithBackoff } from "../utils/geminiAnalysis";

/**
 * COMBINED ANALYSIS API
 *
 * Makes ONE Gemini call to provide comprehensive style analysis including:
 * - Body Shape Analysis
 * - Color Season Analysis
 * - Values Analysis (sustainability, budget, style preferences)
 * - Celebrity Recommendations
 *
 * This replaces 3 separate API calls with a single comprehensive analysis.
 */

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

  // Define body outside try block so it's accessible in catch block for fallback
  let body: any;

  try {
    body = await request.json();
    const {
      bodyShape,
      measurements,
      colorSeason,
      colorAnalysis,
      valuesPreferences,
      shop
    } = body;

    // Validate required fields
    if (!bodyShape) {
      return json({ error: "Body shape required" }, { status: 400, headers: corsHeaders });
    }

    // Color season is now optional (users can skip this quiz)
    // if (!colorSeason) {
    //   return json({ error: "Color season required" }, { status: 400, headers: corsHeaders });
    // }

    if (!shop) {
      return json({ error: "Shop parameter required" }, { status: 400, headers: corsHeaders });
    }

    console.log(`INFO: Combined analysis request for ${measurements?.gender || 'unspecified'}: ${bodyShape} / ${colorSeason}`);

    // Load Gemini settings from database (includes custom API key and prompts)
    const geminiSettings = await loadGeminiSettings(shop);

    // Use custom API key from database, or fall back to environment variable
    const apiKey = geminiSettings.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("ERROR: GEMINI_API_KEY not set in database or environment");
      return json({ error: "API key not configured" }, { status: 500, headers: corsHeaders });
    }

    // Create Gemini client with API key
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiSettings.model || "gemini-2.0-flash-exp" });

    // Build comprehensive context from all quiz data
    const customerProfile = buildCustomerProfile(measurements, colorAnalysis, valuesPreferences);

    // Use ONE custom prompt for all customer analysis (body + color + values + celebrity)
    const customerAnalysisPrompt = geminiSettings.customerAnalysisPrompt ||
      `You are a comprehensive fashion advisor with expertise in body shape analysis, color theory, personal values alignment, and celebrity style inspiration.

Your role is to provide warm, encouraging, and highly personalized guidance that helps customers understand their unique style profile. You analyze their:

1. Body Shape & Proportions - Provide kind, confidence-building advice
2. Color Season & Flattering Colors - Make color theory accessible and exciting
3. Shopping Values & Preferences - Help align wardrobe with values
4. Celebrity Style Icons - Connect with celebrities who share their characteristics

Make every customer feel seen, understood, and excited about their personal style journey.`;

    console.log('INFO: COMBINED ANALYSIS - Using customer analysis prompt:', {
      hasCustomerAnalysisPrompt: !!geminiSettings.customerAnalysisPrompt,
      promptLength: customerAnalysisPrompt.length
    });

    // Build comprehensive prompt requesting all four analyses
    const prompt = buildCombinedPrompt({
      bodyShape,
      colorSeason,
      customerProfile,
      customerAnalysisPrompt,
      measurements,
      colorAnalysis,
      valuesPreferences
    });

    // Call Gemini with retry logic
    const result = await retryWithBackoff(() =>
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192, // Increased for comprehensive response
          responseMimeType: "application/json"
        }
      })
    );

    const responseText = result.response.text();
    const analysis = JSON.parse(responseText);

    console.log("INFO: Got combined analysis from Gemini");

    // Only include analyses that user actually completed
    const hasColorSeason = !!colorSeason;
    const valuesCompleted = valuesPreferences?.completed === true;
    const hasActualValues = valuesPreferences?.sustainability || valuesPreferences?.budgetRange || (valuesPreferences?.styles && valuesPreferences.styles.length > 0);
    const includeValues = valuesCompleted && hasActualValues;

    return json({
      success: true,
      bodyShape,
      colorSeason,
      bodyShapeAnalysis: analysis.bodyShapeAnalysis,
      colorSeasonAnalysis: hasColorSeason ? analysis.colorSeasonAnalysis : null,
      valuesAnalysis: includeValues ? analysis.valuesAnalysis : null,
      celebrityRecommendations: analysis.celebrityRecommendations,
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("ERROR: Error getting combined analysis:", error);

    // Check if it's a Gemini overload error (503)
    const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');

    if (isOverloaded) {
      console.log("WARNING: Gemini API is overloaded, returning fallback analysis");

      // Return fallback analysis
      const fallbackAnalysis = getFallbackCombinedAnalysis(body);

      return json({
        success: true,
        fallback: true,
        ...fallbackAnalysis,
      }, { headers: corsHeaders });
    }

    // For other errors, return error response
    return json(
      {
        error: "Failed to get combined analysis",
        message: error?.message || "Unknown error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Build comprehensive customer profile from all quiz data
 */
function buildCustomerProfile(measurements: any, colorAnalysis: any, valuesPreferences: any): string {
  let profile = "";

  // Body measurements
  if (measurements) {
    profile += "\n\n**BODY MEASUREMENTS:**";
    if (measurements.gender) profile += `\n- Gender: ${measurements.gender}`;
    if (measurements.age) profile += `\n- Age: ${measurements.age}`;
    if (measurements.height) profile += `\n- Height: ${measurements.height} cm`;
    if (measurements.weight) profile += `\n- Weight: ${measurements.weight} kg`;
    if (measurements.bust) profile += `\n- Bust: ${measurements.bust} cm`;
    if (measurements.waist) profile += `\n- Waist: ${measurements.waist} cm`;
    if (measurements.hips) profile += `\n- Hips: ${measurements.hips} cm`;
    if (measurements.shoulders) profile += `\n- Shoulders: ${measurements.shoulders} cm`;
  }

  // Color characteristics with enhanced context
  if (colorAnalysis) {
    profile += "\n\n**COLOR CHARACTERISTICS:**";
    if (colorAnalysis.undertone) {
      profile += `\n- Undertone: ${colorAnalysis.undertone}`;
      if (colorAnalysis.undertoneContext) {
        profile += ` (${colorAnalysis.undertoneContext})`;
      }
    }
    if (colorAnalysis.depth) {
      profile += `\n- Depth: ${colorAnalysis.depth}`;
      if (colorAnalysis.depthContext) {
        profile += ` (${colorAnalysis.depthContext})`;
      }
    }
    if (colorAnalysis.intensity) {
      profile += `\n- Intensity: ${colorAnalysis.intensity}`;
      if (colorAnalysis.intensityContext) {
        profile += ` (${colorAnalysis.intensityContext})`;
      }
    }
  }

  // Values and preferences
  if (valuesPreferences) {
    profile += "\n\n**VALUES & PREFERENCES:**";
    if (valuesPreferences.sustainability !== undefined) {
      profile += `\n- Sustainability: ${valuesPreferences.sustainability ? 'Important' : 'Not a priority'}`;
    }
    if (valuesPreferences.budgetRange) {
      profile += `\n- Budget: ${valuesPreferences.budgetRange}`;
    }
    if (valuesPreferences.styles && valuesPreferences.styles.length > 0) {
      profile += `\n- Style Preferences: ${valuesPreferences.styles.join(', ')}`;
    }
  }

  return profile;
}

/**
 * Build comprehensive prompt requesting all four analyses in one call
 */
function buildCombinedPrompt(config: any): string {
  const {
    bodyShape,
    colorSeason,
    customerProfile,
    customerAnalysisPrompt,
    measurements,
    valuesPreferences
  } = config;

  // Build gender-specific guidance
  let genderGuidance = "";
  if (measurements?.gender) {
    if (measurements.gender === "man") {
      genderGuidance = "\n\nIMPORTANT: This customer is MALE. All recommendations must be appropriate for men's fashion (shirts, suits, pants, accessories, grooming). DO NOT recommend makeup, dresses, or women's clothing.";
    } else if (measurements.gender === "woman") {
      genderGuidance = "\n\nIMPORTANT: This customer is FEMALE. Provide styling tips for women's fashion including clothing, accessories, and makeup when relevant.";
    } else {
      genderGuidance = "\n\nIMPORTANT: This customer identifies as NON-BINARY. Provide inclusive styling tips that work across different fashion styles, focusing on versatile pieces.";
    }
  }

  // Check if user completed color season and values questionnaires
  const hasColorSeason = !!colorSeason;
  const valuesCompleted = valuesPreferences?.completed === true;
  const hasActualValues = valuesPreferences?.sustainability || valuesPreferences?.budgetRange || (valuesPreferences?.styles && valuesPreferences.styles.length > 0);
  const includeValuesAnalysis = valuesCompleted && hasActualValues;

  let valuesSection = "";
  if (includeValuesAnalysis) {
    valuesSection = `

**CUSTOMER'S VALUES & PREFERENCES:**
- Sustainability: ${valuesPreferences?.sustainability ? 'Important' : 'Not a priority'}
- Budget: ${valuesPreferences?.budgetRange || 'Not specified'}
- Style Preferences: ${valuesPreferences?.styles?.join(', ') || 'Not specified'}`;
  }

  // Count how many sections to request
  let sectionCount = 2; // Body shape + Celebrity (always included)
  if (hasColorSeason) sectionCount++;
  if (includeValuesAnalysis) sectionCount++;
  const numberOfSections = sectionCount === 2 ? "TWO" : sectionCount === 3 ? "THREE" : "FOUR";

  return `${customerAnalysisPrompt}

**CUSTOMER PROFILE:**
- Body Shape: ${bodyShape}${hasColorSeason ? `\n- Color Season: ${colorSeason}` : ''}${customerProfile}${genderGuidance}${valuesSection}

---

Please provide a comprehensive analysis covering ${numberOfSections} sections:

## 1. BODY SHAPE ANALYSIS
Analyze the "${bodyShape}" body shape and provide:
- Detailed explanation of what makes this body shape unique (2-3 paragraphs)
- Style goals that work best for this shape
- Specific clothing recommendations by category with reasoning
- Items to avoid and why
- Professional styling tips

${hasColorSeason ? `## 2. COLOR SEASON ANALYSIS
Analyze the "${colorSeason}" color season and provide:
- Detailed explanation of this color season's characteristics (2-3 paragraphs)
- Best colors for this season
- Color palette organized by category (neutrals, accents, statements) with reasoning
- Colors to avoid and why
- Styling tips for incorporating these colors

` : ''}${includeValuesAnalysis ? `## ${hasColorSeason ? '3' : '2'}. VALUES ANALYSIS
Analyze the customer's shopping values and preferences:
- Thoughtful analysis of how their values shape their ideal wardrobe (2-3 paragraphs)
- Brands or shopping strategies that align with their values
- How to balance their preferences with their body shape${hasColorSeason ? ' and color season' : ''}
- Practical tips for shopping within their parameters

## ${hasColorSeason ? '4' : '3'}. CELEBRITY STYLE INSPIRATION` : `## ${hasColorSeason ? '3' : '2'}. CELEBRITY STYLE INSPIRATION`}
Recommend 3-4 celebrities who match this customer's profile (body shape, color season, and style preferences).${measurements?.gender ? ` MUST recommend ${measurements.gender === 'man' ? 'MALE' : measurements.gender === 'woman' ? 'FEMALE' : 'DIVERSE'} celebrities only.` : ''}

For each celebrity provide:
- Name
- Why they're a great style match (mention body shape, color season, and if relevant, values alignment)
- Specific styling tips inspired by their signature looks
- Key wardrobe pieces they often wear

---

Return your response as a JSON object with this EXACT structure:

{
  "bodyShapeAnalysis": {
    "analysis": "Detailed explanation (2-3 paragraphs)",
    "styleGoals": ["Goal 1", "Goal 2", "Goal 3"],
    "recommendations": [
      {
        "category": "Category name",
        "items": ["Item 1", "Item 2", "Item 3"],
        "reasoning": "Why these items work",
        "stylingTips": "Specific tips for wearing these items"
      }
    ],
    "avoidItems": [
      {
        "item": "Item to avoid",
        "reason": "Why it may not be flattering"
      }
    ],
    "proTips": ["Tip 1", "Tip 2", "Tip 3"]
  },${hasColorSeason ? `
  "colorSeasonAnalysis": {
    "analysis": "Detailed explanation (2-3 paragraphs)",
    "bestColors": ["Color 1", "Color 2", "Color 3", "Color 4", "Color 5"],
    "colorPalette": [
      {
        "category": "Category name",
        "colors": ["Color 1", "Color 2", "Color 3"],
        "reasoning": "Why these colors work"
      }
    ],
    "avoidColors": [
      {
        "color": "Color to avoid",
        "reason": "Why this may not be flattering"
      }
    ],
    "stylingTips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4"]
  },` : ''}${includeValuesAnalysis ? `
  "valuesAnalysis": {
    "analysis": "Thoughtful analysis of their shopping values (2-3 paragraphs)",
    "recommendedBrands": ["Brand/strategy 1", "Brand/strategy 2", "Brand/strategy 3"],
    "balancingTips": ["How to balance values with style", "Practical shopping advice", "Budget-conscious tips"],
    "sustainabilityTips": ["Sustainability tip 1", "Tip 2"] // Only if sustainability is important
  },` : ''}
  "celebrityRecommendations": {
    "summary": "Brief overview of the customer's unique style profile (2-3 sentences)",
    "celebrities": [
      {
        "name": "Celebrity Full Name",
        "matchReason": "Detailed explanation of why they match",
        "stylingTips": ["Tip 1", "Tip 2", "Tip 3"],
        "signaturePieces": ["Piece 1", "Piece 2", "Piece 3"],
        "imageSearchQuery": "Celebrity Name fashion style"
      }
    ]
  }
}

Make all recommendations specific, practical, and empowering. Focus on helping the customer feel confident and aligned with their authentic style.`;
}

/**
 * Fallback combined analysis when Gemini API is unavailable
 */
function getFallbackCombinedAnalysis(requestBody: any): any {
  const { bodyShape, colorSeason, measurements, valuesPreferences } = requestBody;

  return {
    bodyShape,
    colorSeason,
    bodyShapeAnalysis: {
      analysis: `Your ${bodyShape} body shape has a beautiful, balanced silhouette. The key to dressing this shape is understanding your proportions and choosing pieces that enhance your natural figure.`,
      styleGoals: [
        "Highlight your best features with strategic styling",
        "Create balance and proportion in your outfits",
        "Choose pieces that make you feel confident and comfortable"
      ],
      recommendations: [
        {
          category: "Essentials",
          items: ["Well-fitted basics", "Structured pieces", "Flattering silhouettes"],
          reasoning: "These foundational pieces work with your body shape to create a polished look.",
          stylingTips: "Focus on fit and quality. Well-made pieces that fit properly will always look better than trendy items that don't suit your shape."
        }
      ],
      avoidItems: [
        {
          item: "Overly baggy or shapeless clothing",
          reason: "These can hide your natural proportions"
        }
      ],
      proTips: [
        "Invest in tailoring to ensure perfect fit",
        "Choose fabrics with good structure",
        "Define your waist to create shape"
      ]
    },
    colorSeasonAnalysis: {
      analysis: `Your ${colorSeason} color season means you have a beautiful natural coloring that's enhanced by specific color families. Understanding your season helps you choose colors that make you glow.`,
      bestColors: ["Colors that complement your natural tones", "Shades that enhance your features", "Hues that bring out your best"],
      colorPalette: [
        {
          category: "Your Best Colors",
          colors: ["Flattering shade 1", "Flattering shade 2", "Flattering shade 3"],
          reasoning: "These colors harmonize with your natural coloring"
        }
      ],
      avoidColors: [
        {
          color: "Colors from opposite season",
          reason: "May clash with your natural undertones"
        }
      ],
      stylingTips: [
        "Wear your best colors near your face",
        "Use neutrals from your season as a base",
        "Add pops of your accent colors for interest"
      ]
    },
    valuesAnalysis: {
      analysis: `Your shopping values reflect what matters most to you. ${valuesPreferences?.sustainability ? 'Your commitment to sustainability is admirable.' : ''} ${valuesPreferences?.budgetRange ? `With a ${valuesPreferences.budgetRange} budget, you can still build a stylish wardrobe.` : ''} The key is making intentional choices that align with both your values and your style.`,
      recommendedBrands: [
        "Brands that match your values",
        "Shopping strategies for your budget",
        "Quality over quantity approach"
      ],
      balancingTips: [
        "Invest in versatile pieces that work multiple ways",
        "Choose quality basics that last",
        "Shop intentionally rather than impulsively"
      ],
      sustainabilityTips: valuesPreferences?.sustainability ? [
        "Look for sustainable and ethical brands",
        "Consider secondhand and vintage options",
        "Invest in pieces you'll wear for years"
      ] : []
    },
    celebrityRecommendations: {
      summary: `Your ${bodyShape} body shape and ${colorSeason} coloring create a unique style profile that's enhanced by your personal preferences.`,
      celebrities: [
        {
          name: "Style Icon",
          matchReason: "Shares similar proportions and coloring",
          stylingTips: [
            "Take inspiration from their signature looks",
            "Adapt their style to your preferences",
            "Notice how they balance proportions"
          ],
          signaturePieces: [
            "Classic wardrobe staples",
            "Statement accessories",
            "Versatile basics"
          ],
          imageSearchQuery: "celebrity fashion style"
        }
      ]
    }
  };
}
