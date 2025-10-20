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
      where: { shop },
      orderBy: { id: 'desc' } // Get the most recent session
    });

    if (!sessionRecord) {
      console.log(`⚠️ No session found for ${shop}`);
      console.log(`📋 Checking all shops in database...`);
      const allSessions = await db.session.findMany({
        select: { shop: true, appSettings: true }
      });
      console.log(`📋 Available shops:`, allSessions.map(s => ({ shop: s.shop, hasSettings: !!s.appSettings })));
      return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
    }

    if (!sessionRecord.appSettings) {
      console.log(`⚠️ Session found for ${shop} but no appSettings saved yet`);
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
