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
    const colorSeason = formData.get("colorSeason") as string | null;
    const storeDomain = formData.get("storeDomain") as string;
    const bust = formData.get("bust") as string;
    const waist = formData.get("waist") as string;
    const hips = formData.get("hips") as string;
    const shoulders = formData.get("shoulders") as string;
    const gender = formData.get("gender") as string;
    const age = formData.get("age") as string;

    // Get settings from FormData (passed from storefront)
    const numberOfSuggestions = parseInt(formData.get("numberOfSuggestions") as string) || 30;
    const minimumMatchScore = parseInt(formData.get("minimumMatchScore") as string) || 30;
    const maxProductsToScan = parseInt(formData.get("maxProductsToScan") as string) || 0;
    const onlyInStock = formData.get("onlyInStock") === "true";
    const enableImageAnalysis = formData.get("enableImageAnalysis") === "true";

    if (!bodyShape) {
      return json({ error: "Body shape is required" }, { status: 400, headers });
    }

    if (!storeDomain) {
      return json({ error: "Store domain is required" }, { status: 400, headers });
    }

    // Use the full storeDomain as shop identifier (matches what's saved in admin)
    const shop = storeDomain;

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

    console.log(`📊 Settings from storefront: suggestions=${numberOfSuggestions}, minScore=${minimumMatchScore}, maxScan=${maxProductsToScan}, inStock=${onlyInStock}, imageAnalysis=${enableImageAnalysis}`);
    if (colorSeason) {
      console.log(`🎨 Color Season: ${colorSeason}`);
    }

    // Get recommendations from Claude AI using MCP
    console.log(`📞 API Call: Getting Claude recommendations for ${bodyShape} from ${storeDomain}`);
    const recommendations = await getClaudeProductRecommendations(
      storeDomain,
      shop,
      bodyShape,
      measurements,
      numberOfSuggestions,
      minimumMatchScore,
      maxProductsToScan,
      onlyInStock,
      colorSeason || undefined,
      enableImageAnalysis
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
            image: rec.product.image || rec.product.imageUrl,
            imageUrl: rec.product.imageUrl || rec.product.image,
            images: rec.product.image ? [{ src: rec.product.image }] : [],
            variants: rec.product.variants,
            price: rec.product.price,
            productType: rec.product.productType,
            tags: rec.product.tags,
            url: `https://${storeDomain}/products/${rec.product.handle}`,
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
