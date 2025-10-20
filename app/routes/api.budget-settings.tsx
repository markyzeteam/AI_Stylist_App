import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { loadGeminiSettings } from "../utils/geminiAnalysis";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Get shop from query parameter
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      console.log("⚠️ No shop parameter provided, returning default budget ranges");
      return json({
        budgetLowMax: 30,
        budgetMediumMax: 80,
        budgetHighMax: 200
      }, { headers: corsHeaders });
    }

    console.log(`📊 Loading budget settings for shop: ${shop}`);

    // Load Gemini settings which include budget ranges
    const settings = await loadGeminiSettings(shop);

    const budgetSettings = {
      budgetLowMax: settings.budgetLowMax || 30,
      budgetMediumMax: settings.budgetMediumMax || 80,
      budgetHighMax: settings.budgetHighMax || 200
    };

    console.log(`✅ Loaded budget settings for ${shop}:`, budgetSettings);

    return json(budgetSettings, { headers: corsHeaders });
  } catch (error) {
    console.error("Error loading budget settings:", error);
    return json({
      budgetLowMax: 30,
      budgetMediumMax: 80,
      budgetHighMax: 200
    }, { headers: corsHeaders });
  }
}
