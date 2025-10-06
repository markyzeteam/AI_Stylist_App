import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

// Storefront API endpoint - returns product recommendations based on body shape
// This uses mock data since we need Storefront API access token configured
export async function action({ request }: ActionFunctionArgs) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const bodyData = await request.json();
    const bodyShape = bodyData.bodyShape;

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers });
    }

    // Return recommendations and let the storefront use Liquid to fetch actual products
    const recommendations = getStyleRecommendationsForShape(bodyShape);

    return json({
      bodyShape,
      recommendations: recommendations.styles,
      productTags: recommendations.tags,
      collectionUrl: `/collections/all?body_shape=${encodeURIComponent(bodyShape)}`
    }, { headers });

  } catch (error) {
    console.error("Error in storefront API:", error);
    return json(
      { error: "Failed to process request" },
      { status: 500, headers }
    );
  }
}

function getStyleRecommendationsForShape(bodyShape: string) {
  const recommendations: Record<string, { styles: string[], tags: string[] }> = {
    "Pear/Triangle": {
      styles: [
        "A-line and fit-and-flare dresses",
        "Wide-leg pants and bootcut jeans",
        "Tops with interesting necklines",
        "Structured blazers to balance shoulders"
      ],
      tags: ["a-line", "fit-and-flare", "wide-leg", "bootcut", "pear-shape"]
    },
    "Apple/Round": {
      styles: [
        "Empire waist dresses",
        "V-neck and scoop neck tops",
        "High-waisted bottoms",
        "Flowing fabrics that skim the body"
      ],
      tags: ["empire-waist", "v-neck", "flowing", "high-waisted", "apple-shape"]
    },
    "Hourglass": {
      styles: [
        "Fitted clothing that follows your curves",
        "Wrap dresses and tops",
        "High-waisted styles",
        "Belted garments to emphasize waist"
      ],
      tags: ["fitted", "wrap", "belted", "high-waisted", "hourglass-shape"]
    },
    "Inverted Triangle": {
      styles: [
        "A-line skirts and dresses",
        "Wide-leg pants",
        "Scoop and V-necklines",
        "Styles that minimize shoulder details"
      ],
      tags: ["a-line", "wide-leg", "scoop-neck", "v-neck", "inverted-triangle"]
    },
    "Rectangle/Straight": {
      styles: [
        "Create curves with belts and fitted styles",
        "Layering to add dimension",
        "Peplum tops and dresses",
        "Cropped jackets and structured pieces"
      ],
      tags: ["belted", "peplum", "structured", "layered", "rectangle-shape"]
    },
    "V-Shape/Athletic": {
      styles: [
        "Fitted shirts that show your shape",
        "Straight-leg pants",
        "Minimal shoulder padding",
        "V-necks and open collars"
      ],
      tags: ["fitted", "straight-leg", "v-neck", "athletic", "v-shape"]
    }
  };

  return recommendations[bodyShape] || { styles: [], tags: [] };
}

export async function loader() {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  };
  return json({ error: "Use POST method" }, { status: 405, headers });
}
