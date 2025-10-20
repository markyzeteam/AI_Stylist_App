import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getGeminiProductRecommendations } from "../utils/geminiRecommendations";

/**
 * GEMINI RECOMMENDATIONS API ENDPOINT (Phase 2)
 *
 * This is a public API endpoint for storefront access.
 * Uses Gemini 2.0 Flash with CACHED product analysis (no images sent).
 *
 * This is the NEW Gemini-only implementation.
 * Old Claude endpoint: api.claude.recommendations.tsx
 */

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

    // Get values preferences from FormData
    const sustainability = formData.get("sustainability") === "true";
    const budgetRangeRaw = formData.get("budgetRange") as string | null;
    const budgetRange = budgetRangeRaw && budgetRangeRaw !== "null" ? budgetRangeRaw : null;
    const stylePreferences = formData.get("stylePreferences") as string | null;
    const styles = stylePreferences ? stylePreferences.split(',').filter(s => s.trim()) : [];

    // Get settings from FormData (passed from storefront)
    const numberOfSuggestions = parseInt(formData.get("numberOfSuggestions") as string) || 30;
    const minimumMatchScore = parseInt(formData.get("minimumMatchScore") as string) || 30;
    const maxProductsToScan = parseInt(formData.get("maxProductsToScan") as string) || 0;
    const onlyInStock = formData.get("onlyInStock") === "true";

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

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🤖 GEMINI RECOMMENDATIONS REQUEST`);
    console.log(`${"=".repeat(60)}`);
    console.log(`📊 Settings:`, {
      shop,
      bodyShape,
      colorSeason: colorSeason || 'none',
      numberOfSuggestions,
      minimumMatchScore,
      maxProductsToScan,
      onlyInStock,
      hasMeasurements: !!measurements,
    });
    console.log(`💎 Values Preferences:`, {
      sustainability,
      budgetRange: budgetRange || 'none',
      stylePreferences: styles.length > 0 ? styles.join(', ') : 'none',
      hasPreferences: sustainability || !!budgetRange || styles.length > 0
    });
    console.log(`${"=".repeat(60)}\n`);

    // Prepare values preferences
    const valuesPreferences = (sustainability || budgetRange || styles.length > 0) ? {
      sustainability,
      budgetRange: budgetRange || undefined,
      styles,
    } : undefined;

    // Get recommendations from Gemini AI using cached analysis
    const recommendations = await getGeminiProductRecommendations(
      storeDomain,
      shop,
      bodyShape,
      measurements,
      numberOfSuggestions,
      minimumMatchScore,
      maxProductsToScan,
      onlyInStock,
      colorSeason || undefined,
      valuesPreferences
    );

    console.log(`\n✅ Returning ${recommendations.length} recommendations to storefront\n`);

    return json(
      {
        bodyShape,
        colorSeason,
        recommendations: recommendations.map(rec => ({
          product: {
            id: rec.product.id,
            shopifyProductId: rec.product.shopifyProductId,
            title: rec.product.title,
            description: rec.product.description,
            handle: rec.product.handle,
            image: rec.product.imageUrl,
            imageUrl: rec.product.imageUrl,
            images: rec.product.imageUrl ? [{ src: rec.product.imageUrl }] : [],
            variants: rec.product.variants,
            price: rec.product.price,
            productType: rec.product.productType,
            tags: rec.product.tags,
            url: `https://${storeDomain}/products/${rec.product.handle}`,
            // Include visual analysis for frontend display
            visualAnalysis: {
              colors: rec.product.detectedColors || [],
              colorSeasons: rec.product.colorSeasons || [],
              silhouette: rec.product.silhouetteType || 'Unknown',
              styles: rec.product.styleClassification || [],
              fabric: rec.product.fabricTexture || 'Unknown',
              details: rec.product.designDetails || [],
              pattern: rec.product.patternType || 'Unknown',
            },
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
    console.error("❌ Error in Gemini recommendations API:", error);
    return json(
      { error: "Failed to fetch Gemini recommendations" },
      { status: 500, headers }
    );
  }
}
