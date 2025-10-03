import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { cors } from "@remix-run/node";

// This is a public API endpoint for storefront access
export async function loader({ request }: ActionFunctionArgs) {
  return json({ error: "Use POST method" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  // Enable CORS for storefront requests
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const formData = await request.formData();
    const bodyShape = formData.get("bodyShape") as string;
    const shopDomain = formData.get("shopDomain") as string;

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers });
    }

    // Import the helper functions
    const { calculateBodyShape } = await import("../utils/bodyShape");
    const { BODY_SHAPE_PREFERENCES, STOREFRONT_PRODUCT_TAGS } = await import("../utils/storefrontRecommendations");

    // Get style recommendations based on body shape
    const recommendations = getStyleRecommendations(bodyShape);
    const productTags = getProductTags(bodyShape);

    return json(
      {
        bodyShape,
        recommendations,
        productTags,
        styleKeywords: BODY_SHAPE_PREFERENCES[bodyShape as keyof typeof BODY_SHAPE_PREFERENCES]?.keywords || [],
      },
      { headers }
    );
  } catch (error) {
    console.error("Error in recommendations API:", error);
    return json(
      { error: "Failed to fetch recommendations" },
      { status: 500, headers }
    );
  }
}

// Style recommendations for each body shape
function getStyleRecommendations(bodyShape: string): string[] {
  const recommendations: Record<string, string[]> = {
    "Pear/Triangle": [
      "A-line and fit-and-flare dresses",
      "Wide-leg pants and bootcut jeans",
      "Tops with interesting necklines",
      "Structured blazers to balance shoulders",
    ],
    "Apple/Round": [
      "Empire waist dresses",
      "V-neck and scoop neck tops",
      "High-waisted bottoms",
      "Flowing fabrics that skim the body",
    ],
    "Hourglass": [
      "Fitted clothing that follows your curves",
      "Wrap dresses and tops",
      "High-waisted styles",
      "Belted garments to emphasize waist",
    ],
    "Inverted Triangle": [
      "A-line skirts and dresses",
      "Wide-leg pants",
      "Scoop and V-necklines",
      "Minimize shoulder details",
    ],
    "Rectangle/Straight": [
      "Create curves with belts and fitted styles",
      "Layering to add dimension",
      "Peplum tops and dresses",
      "Cropped jackets and structured pieces",
    ],
    "V-Shape/Athletic": [
      "Fitted shirts that show your shape",
      "Straight-leg pants",
      "Minimal shoulder padding",
      "V-necks and open collars",
    ],
  };

  return recommendations[bodyShape] || [];
}

// Get product tags to filter by in Shopify collections
function getProductTags(bodyShape: string): string[] {
  const tags: Record<string, string[]> = {
    "Pear/Triangle": ["a-line", "fit-and-flare", "wide-leg", "bootcut"],
    "Apple/Round": ["empire-waist", "v-neck", "flowing", "high-waisted"],
    "Hourglass": ["fitted", "wrap", "belted", "high-waisted"],
    "Inverted Triangle": ["a-line", "wide-leg", "scoop-neck", "v-neck"],
    "Rectangle/Straight": ["belted", "peplum", "structured", "layered"],
    "V-Shape/Athletic": ["fitted", "straight-leg", "v-neck", "athletic"],
  };

  return tags[bodyShape] || [];
}
