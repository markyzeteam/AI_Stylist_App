import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getClaudeProductRecommendations } from "../utils/claudeRecommendations";

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
    const storeDomain = formData.get("storeDomain") as string;
    const bust = formData.get("bust") as string;
    const waist = formData.get("waist") as string;
    const hips = formData.get("hips") as string;
    const shoulders = formData.get("shoulders") as string;
    const gender = formData.get("gender") as string;
    const age = formData.get("age") as string;
    const onlyInStock = formData.get("onlyInStock") !== "false"; // Default to true

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers });
    }

    if (!storeDomain) {
      return json({ error: "Store domain is required" }, { status: 400, headers });
    }

    // Extract shop name from store domain (remove .myshopify.com)
    const shop = storeDomain.replace('.myshopify.com', '');

    // Prepare measurements if provided
    let measurements;
    if (bust && waist && hips && shoulders && gender && age) {
      measurements = {
        bust: parseFloat(bust),
        waist: parseFloat(waist),
        hips: parseFloat(hips),
        shoulders: parseFloat(shoulders),
        gender,
        age,
      };
    }

    // Get recommendations from Claude AI using MCP
    console.log(`📞 API Call: Getting Claude recommendations for ${bodyShape} from ${storeDomain}`);
    const recommendations = await getClaudeProductRecommendations(
      storeDomain,
      shop,
      bodyShape,
      measurements,
      12, // Number of recommendations
      onlyInStock
    );

    return json(
      {
        bodyShape,
        recommendations: recommendations.map(rec => ({
          product: {
            id: rec.product.id,
            title: rec.product.title,
            description: rec.product.description,
            handle: rec.product.handle,
            images: rec.product.images,
            variants: rec.product.variants,
            productType: rec.product.productType,
            tags: rec.product.tags,
          },
          suitabilityScore: rec.suitabilityScore,
          recommendedSize: rec.recommendedSize,
          reasoning: rec.reasoning,
          category: rec.category,
          stylingTip: rec.stylingTip,
        })),
      },
      { headers }
    );
  } catch (error) {
    console.error("Error in Claude recommendations API:", error);
    return json(
      { error: "Failed to fetch Claude recommendations" },
      { status: 500, headers }
    );
  }
}
