import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { loadSettings, DEFAULT_SETTINGS } from "../utils/settings";

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

  // Storefront can't authenticate as admin, so always return default settings
  // The settings are baked into the theme extension deployment
  console.log("API settings endpoint called - returning default settings");
  return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
}
