import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { loadSettings, DEFAULT_SETTINGS } from "../utils/settings";
import db from "../db.server";

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
      console.log("⚠️ No shop parameter provided, returning default settings");
      return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
    }

    console.log(`📊 Loading settings for shop: ${shop}`);

    // Load settings from database
    const sessionRecord = await db.session.findFirst({
      where: { shop }
    });

    if (!sessionRecord || !sessionRecord.appSettings) {
      console.log(`⚠️ No settings found for ${shop}, returning defaults`);
      return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
    }

    const settings = JSON.parse(sessionRecord.appSettings);
    console.log(`✅ Loaded settings for ${shop}:`, settings);

    return json({ settings }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error loading settings:", error);
    return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
  }
}
