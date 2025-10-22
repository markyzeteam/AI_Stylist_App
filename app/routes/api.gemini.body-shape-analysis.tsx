import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadGeminiSettings, retryWithBackoff } from "../utils/geminiAnalysis";

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

    // Use custom bodyShapePrompt from settings, or fall back to default
    const bodyShapePrompt = geminiSettings.bodyShapePrompt || "You are an expert fashion stylist and personal shopper.";

    console.log('🔍 BODY SHAPE ANALYSIS - Using prompt:', {
      hasCustomPrompt: !!geminiSettings.bodyShapePrompt,
      promptLength: bodyShapePrompt.length,
      promptPreview: bodyShapePrompt.substring(0, 80)
    });

    const prompt = `${bodyShapePrompt}

A customer has been identified as having a "${bodyShape}" body shape.${measurementContext}

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

    // Call Gemini with retry logic
    const result = await retryWithBackoff(() =>
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    );

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

    // Check if it's a Gemini overload error (503)
    const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');

    if (isOverloaded) {
      console.log("⚠️ Gemini API is overloaded, returning fallback body shape analysis");

      // Return fallback analysis based on body shape
      const fallbackAnalysis = getFallbackBodyShapeAnalysis(bodyShape);

      return json({
        success: true,
        fallback: true,
        bodyShape,
        analysis: fallbackAnalysis,
      }, { headers: corsHeaders });
    }

    // For other errors, return error response
    return json(
      {
        error: "Failed to get style analysis",
        message: error?.message || "Unknown error",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Fallback body shape analysis when Gemini API is unavailable
 */
function getFallbackBodyShapeAnalysis(bodyShape: string): any {
  const analyses: Record<string, any> = {
    "Pear/Triangle": {
      analysis: "The Pear or Triangle body shape is characterized by hips that are wider than the shoulders, creating a beautiful feminine silhouette. This body shape typically features a defined waist and fuller lower body. The key to dressing this shape is creating balance by drawing attention to the upper body while streamlining the lower half.",
      styleGoals: [
        "Balance wider hips with defined shoulders",
        "Highlight the waist and upper body",
        "Create vertical lines to elongate the silhouette"
      ],
      recommendations: [
        {
          category: "Tops",
          items: ["Boat neck blouses", "Off-shoulder tops", "Statement sleeve shirts", "Detailed necklines"],
          reasoning: "These styles draw attention to the shoulders and upper body, creating visual balance with wider hips.",
          stylingTips: "Look for tops with interesting details at the neckline or shoulders. Lighter colors on top paired with darker bottoms work beautifully."
        },
        {
          category: "Dresses",
          items: ["A-line dresses", "Fit-and-flare styles", "Empire waist dresses", "Wrap dresses"],
          reasoning: "These silhouettes emphasize the waist while gracefully skimming over the hips, creating a balanced, flattering look.",
          stylingTips: "Choose dresses that cinch at the natural waist and flow away from the body. Avoid overly clingy fabrics on the lower half."
        },
        {
          category: "Bottoms",
          items: ["Bootcut jeans", "Wide-leg pants", "Dark wash denim", "A-line skirts"],
          reasoning: "These styles create a streamlined lower body while balancing proportions.",
          stylingTips: "Opt for darker colors on the bottom half and avoid excessive pockets or embellishments on the hips."
        }
      ],
      avoidItems: [
        {
          item: "Skinny jeans with tight-fitting tops",
          reason: "This combination can emphasize the hip-to-shoulder ratio rather than balancing it"
        },
        {
          item: "Pencil skirts without structured tops",
          reason: "Very form-fitting bottoms without balancing the upper body can draw too much focus to the hips"
        }
      ],
      proTips: [
        "Create an hourglass effect by belting at your natural waist",
        "Use statement jewelry and scarves to draw eyes upward",
        "Dark wash jeans in a bootcut or straight leg are your best friend"
      ]
    },
    "Apple/Round": {
      analysis: "The Apple or Round body shape typically features broader shoulders and bust with a less defined waistline and slimmer legs. This body shape often has beautiful arms and legs to show off. The styling focus is on creating a defined waist and drawing attention to your gorgeous legs and décolletage.",
      styleGoals: [
        "Create the illusion of a defined waist",
        "Draw attention to beautiful legs and shoulders",
        "Balance the torso with vertical lines"
      ],
      recommendations: [
        {
          category: "Tops",
          items: ["V-neck tops", "Empire waist blouses", "Wrap tops", "Peplum styles"],
          reasoning: "These styles create vertical lines and define the waist area, creating a more balanced silhouette.",
          stylingTips: "V-necklines elongate the torso and draw attention to the décolletage. Empire waists define the smallest part of the torso."
        },
        {
          category: "Dresses",
          items: ["A-line dresses", "Shirt dresses with belt", "Fit-and-flare styles", "Maxi dresses"],
          reasoning: "These dress styles skim over the midsection while creating shape and showing off your legs.",
          stylingTips: "Look for dresses that don't cling to the midsection but still show your shape. Belting above the natural waist works wonders."
        },
        {
          category: "Bottoms",
          items: ["Bootcut pants", "Tailored trousers", "A-line skirts", "Fitted jeans"],
          reasoning: "These styles balance the proportions and highlight your slimmer lower body.",
          stylingTips: "You can wear more fitted bottoms to show off your legs. Mid-rise or higher waists work best."
        }
      ],
      avoidItems: [
        {
          item: "Tight-fitting tops that cling to the midsection",
          reason: "These can draw attention to areas you'd prefer to streamline"
        },
        {
          item: "Large, bold patterns across the torso",
          reason: "Busy patterns can add visual weight to the midsection"
        }
      ],
      proTips: [
        "Monochromatic outfits create a streamlined, elongating effect",
        "Show off your legs with skirts and dresses above the knee",
        "Layer with long cardigans or dusters to create vertical lines"
      ]
    },
    "Hourglass": {
      analysis: "Your hourglass shape is naturally beautiful and balanced — bust and hips in harmony, with that lovely defined waist. The secret to feeling your best? Simple pieces that celebrate your curves without fuss. Think effortless styles that make you feel confident and comfortable all day long, highlighting that gorgeous waistline while letting you move and live freely.",
      styleGoals: [
        "Show off your natural waistline with ease and confidence",
        "Choose pieces that feel as good as they look",
        "Embrace your curves with comfortable, flattering fits"
      ],
      recommendations: [
        {
          category: "Dresses",
          items: ["Wrap dresses", "Fit-and-flare styles", "Bodycon dresses", "Belted shirt dresses"],
          reasoning: "These styles celebrate your natural curves and emphasize your defined waist.",
          stylingTips: "Wrap dresses are perfect for highlighting your waist. Choose fabrics with good structure that drape beautifully."
        },
        {
          category: "Tops",
          items: ["Fitted blouses", "Peplum tops", "Wrap tops", "V-neck and scoop neck styles"],
          reasoning: "Fitted styles showcase your figure without adding bulk, while highlighting your balanced proportions.",
          stylingTips: "Avoid overly boxy or shapeless tops that hide your waist. Tuck in or belt to define your silhouette."
        },
        {
          category: "Bottoms",
          items: ["High-waisted jeans", "Pencil skirts", "Tailored pants", "A-line skirts"],
          reasoning: "These bottoms complement your proportions and emphasize your waist.",
          stylingTips: "High-waisted styles are your best friend. They elongate your legs and highlight your narrow waist."
        }
      ],
      avoidItems: [
        {
          item: "Shapeless, oversized clothing",
          reason: "Boxy styles hide your beautiful proportions and waist definition"
        },
        {
          item: "Drop-waist dresses",
          reason: "These styles ignore your natural waist and can make you look shapeless"
        }
      ],
      proTips: [
        "Always define your waist with belts, tucked tops, or fitted styles",
        "Fitted styles look amazing on you - don't shy away from showing your shape",
        "Stretchy, structured fabrics that hug your curves are your allies"
      ]
    },
    "Rectangle/Straight": {
      analysis: "The Rectangle or Straight body shape features shoulders, waist, and hips that are relatively similar in width, creating a streamlined silhouette. While the waist isn't dramatically defined, this body shape has a wonderful athletic appearance with great balance. The styling goal is to create curves and the illusion of a defined waist.",
      styleGoals: [
        "Create the illusion of curves and a defined waist",
        "Add dimension to the upper and lower body",
        "Balance the overall silhouette"
      ],
      recommendations: [
        {
          category: "Tops",
          items: ["Peplum tops", "Ruffled blouses", "Layered styles", "Crop tops with high-waisted bottoms"],
          reasoning: "These styles add volume and create the appearance of curves at the bust and waist.",
          stylingTips: "Layering and texture are your friends. Look for tops with details that add dimension to your upper body."
        },
        {
          category: "Dresses",
          items: ["Fit-and-flare dresses", "Belted styles", "Drop-waist dresses", "Tiered dresses"],
          reasoning: "These create shape and movement, adding curves where you want them.",
          stylingTips: "Belt dresses at the natural waist or slightly above to create definition. Prints and patterns work beautifully on you."
        },
        {
          category: "Bottoms",
          items: ["Patterned pants", "Flared jeans", "Pleated skirts", "Cargo pants"],
          reasoning: "These add volume and interest to the lower half, creating a more curved silhouette.",
          stylingTips: "Don't be afraid of details like pockets, patterns, or embellishments that add dimension."
        }
      ],
      avoidItems: [
        {
          item: "Column dresses without definition",
          reason: "Straight silhouettes can emphasize the straight body line rather than creating curves"
        },
        {
          item: "Plain, structured pieces without details",
          reason: "These can look boxy and don't add the dimension that flatters your shape"
        }
      ],
      proTips: [
        "Use belts to create a waistline where you want it",
        "Color blocking with different shades on top and bottom creates curves",
        "You can pull off bold prints and patterns beautifully"
      ]
    },
    "Inverted Triangle": {
      analysis: "The Inverted Triangle body shape features broader shoulders and bust with narrower hips, creating a strong, athletic silhouette. This shape often includes well-defined shoulders and a less pronounced waist. The styling strategy focuses on balancing broader shoulders with the lower body while highlighting your amazing legs.",
      styleGoals: [
        "Balance broad shoulders with the lower body",
        "Draw attention to the waist and hips",
        "Create a proportional, balanced silhouette"
      ],
      recommendations: [
        {
          category: "Tops",
          items: ["V-neck blouses", "Scoop necks", "Raglan sleeves", "Dark colored tops"],
          reasoning: "These styles minimize broad shoulders while elongating the neckline.",
          stylingTips: "Avoid boat necks, cap sleeves, and shoulder pads. Stick with darker colors on top to streamline the upper body."
        },
        {
          category: "Bottoms",
          items: ["A-line skirts", "Wide-leg pants", "Flared jeans", "Patterned bottoms"],
          reasoning: "These add volume to the lower half, creating balance with broader shoulders.",
          stylingTips: "Lighter colors, patterns, and volume on bottom balance your proportions beautifully."
        },
        {
          category: "Dresses",
          items: ["A-line dresses", "Fit-and-flare styles", "Empire waist dresses", "Wrap dresses"],
          reasoning: "These draw attention to the waist and add volume at the hips for a balanced look.",
          stylingTips: "Look for dresses that are fitted on top and fuller on the bottom. V-necks and scoop necks work wonderfully."
        }
      ],
      avoidItems: [
        {
          item: "Shoulder pads or embellished shoulders",
          reason: "These add more width to already broad shoulders"
        },
        {
          item: "Skinny jeans with oversized tops",
          reason: "This combination can emphasize the shoulder-to-hip ratio"
        }
      ],
      proTips: [
        "Dark on top, light on bottom is a winning formula",
        "Show off your legs with skirts and shorts",
        "Statement pants and bottoms are your secret weapon"
      ]
    },
    "V-Shape/Athletic": {
      analysis: "The V-Shape or Athletic body shape features broad shoulders, a strong chest, minimal waist definition, and narrow hips, creating a powerful, athletic silhouette. This shape is characterized by a sporty, fit appearance. The styling approach balances the upper body while creating curves and femininity where desired.",
      styleGoals: [
        "Balance athletic shoulders with the lower body",
        "Create the appearance of a defined waist",
        "Add curves to hips and lower body"
      ],
      recommendations: [
        {
          category: "Tops",
          items: ["V-neck tops", "Scoop necklines", "Soft fabrics", "Fitted waist tops"],
          reasoning: "These styles soften the shoulder line and create a more balanced upper body.",
          stylingTips: "Choose tops that don't add bulk to shoulders. Soft, flowing fabrics work better than structured ones."
        },
        {
          category: "Bottoms",
          items: ["Flared pants", "Wide-leg trousers", "Pleated skirts", "Bootcut jeans"],
          reasoning: "These add volume to the lower half, creating curves and balancing broad shoulders.",
          stylingTips: "You can handle more detail and volume on the bottom. Patterns, ruffles, and embellishments work great."
        },
        {
          category: "Dresses",
          items: ["Fit-and-flare dresses", "A-line styles", "Belted dresses", "Peplum dresses"],
          reasoning: "These create curves at the waist and hips while minimizing the shoulder area.",
          stylingTips: "Look for dresses that cinch at the waist and flare out at the hips. Avoid strapless styles that emphasize shoulders."
        }
      ],
      avoidItems: [
        {
          item: "Shoulder pads or structured blazers",
          reason: "These add unnecessary width to already athletic shoulders"
        },
        {
          item: "Straight, column dresses",
          reason: "These can emphasize the lack of curves rather than creating them"
        }
      ],
      proTips: [
        "Belts are your friend for creating a waistline",
        "Add volume on bottom with ruffles, pleats, or patterns",
        "Show off your fit physique with the right balance of structure and flow"
      ]
    }
  };

  // Return the specific body shape analysis or a generic one if not found
  return analyses[bodyShape] || analyses["Rectangle/Straight"];
}
