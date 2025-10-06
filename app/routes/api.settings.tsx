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

  try {
    // Try to authenticate and load settings
    const { admin } = await authenticate.admin(request);
    const settings = await loadSettings(admin);

    return json({ settings }, { headers: corsHeaders });
  } catch (error) {
    // If authentication fails, return default settings
    // This allows the storefront to work even without admin access
    console.log("Using default settings for unauthenticated request");
    return json({ settings: DEFAULT_SETTINGS }, { headers: corsHeaders });
  }
}
