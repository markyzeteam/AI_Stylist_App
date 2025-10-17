import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  fetchShopifyProducts,
  analyzeProductImage,
  saveAnalyzedProduct,
  logRefreshActivity,
} from "../utils/geminiAnalysis";
import { db } from "../db.server";

/**
 * ADMIN REFRESH API ENDPOINT
 *
 * This endpoint triggers Phase 1 of the Gemini-only architecture:
 * - Fetches all active products from Shopify
 * - Analyzes product images using Gemini 2.0 Flash
 * - Caches analysis results in FilteredSelectionWithImgAnalyzed table
 *
 * Should be called:
 * - Manually by admin (via admin panel)
 * - Automatically via cron job (3x per day recommended)
 * - After new products are added to store
 *
 * Rate limiting: Check ProductRefreshLog to enforce 3x/day limit
 */

export async function loader({ request }: ActionFunctionArgs) {
  return json({ error: "Use POST method" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Authenticate the request (admin only)
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 ADMIN REFRESH STARTED for ${shop}`);
    console.log(`${"=".repeat(60)}\n`);

    const startTime = Date.now();

    // STEP 1: Load settings to get max refreshes per day
    const sessionRecord = await db.session.findUnique({
      where: { id: session.id },
      select: { appSettings: true },
    });

    console.log(`🔍 DEBUG: session.id = ${session.id}`);
    console.log(`🔍 DEBUG: sessionRecord found = ${!!sessionRecord}`);
    console.log(`🔍 DEBUG: appSettings = ${sessionRecord?.appSettings}`);

    let maxRefreshesPerDay = 3; // Default
    if (sessionRecord?.appSettings) {
      try {
        const settings = JSON.parse(sessionRecord.appSettings);
        console.log(`🔍 DEBUG: Parsed settings =`, settings);
        maxRefreshesPerDay = settings.maxRefreshesPerDay || 3;
      } catch (e) {
        console.warn("Failed to parse app settings, using default limit of 3", e);
      }
    } else {
      console.warn(`⚠️ No appSettings found in session record, using default limit of 3`);
    }

    console.log(`📊 Max refreshes per day: ${maxRefreshesPerDay}`);

    // STEP 2: Check rate limiting
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const refreshesToday = await db.productRefreshLog.count({
      where: {
        shop,
        startedAt: {
          gte: today,
        },
        status: "completed",
      },
    });

    console.log(`📊 Refreshes today: ${refreshesToday}/${maxRefreshesPerDay}`);

    if (refreshesToday >= maxRefreshesPerDay) {
      console.warn(`⚠ Rate limit reached: ${refreshesToday} refreshes today`);
      return json(
        {
          error: "Rate limit reached",
          message: `Product refresh can only be run ${maxRefreshesPerDay} times per day`,
          refreshesToday,
          maxRefreshesPerDay,
          nextRefreshAvailable: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { status: 429 }
      );
    }

    // STEP 2: Fetch all active products from Shopify
    console.log(`\n📦 Fetching products from Shopify...`);
    const products = await fetchShopifyProducts(shop);

    if (products.length === 0) {
      console.warn(`⚠ No products found in store`);
      await logRefreshActivity(
        shop,
        "admin_manual",
        0,
        0,
        0,
        0,
        "completed",
        "No products found"
      );
      return json({
        success: true,
        productsFetched: 0,
        productsAnalyzed: 0,
        message: "No products found in store",
      });
    }

    console.log(`✅ Fetched ${products.length} products from Shopify`);

    // STEP 3: Get list of already analyzed products (incremental update)
    const existingAnalyzed = await db.filteredSelectionWithImgAnalyzed.findMany({
      where: { shop },
      select: { shopifyProductId: true, lastUpdated: true },
    });

    const analyzedMap = new Map(
      existingAnalyzed.map(p => [p.shopifyProductId, p.lastUpdated])
    );

    console.log(`📊 Already analyzed: ${analyzedMap.size} products`);

    // STEP 4: Filter products that need analysis
    // Analyze if: (1) not analyzed yet, OR (2) product is very old (>30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const productsToAnalyze = products.filter(p => {
      const lastAnalyzed = analyzedMap.get(p.id);
      if (!lastAnalyzed) return true; // Not analyzed yet
      if (lastAnalyzed < thirtyDaysAgo) return true; // Old analysis
      return false;
    });

    console.log(`📊 Products needing analysis: ${productsToAnalyze.length}`);
    console.log(`   - New products: ${products.filter(p => !analyzedMap.has(p.id)).length}`);
    console.log(`   - Outdated (>30 days): ${products.filter(p => {
      const last = analyzedMap.get(p.id);
      return last && last < thirtyDaysAgo;
    }).length}`);

    if (productsToAnalyze.length === 0) {
      console.log(`✅ All products are up-to-date, no analysis needed`);
      await logRefreshActivity(
        shop,
        "admin_manual",
        products.length,
        0,
        0,
        0,
        "completed",
        "All products up-to-date"
      );
      return json({
        success: true,
        productsFetched: products.length,
        productsAnalyzed: 0,
        productsUpToDate: products.length,
        message: "All products are up-to-date",
      });
    }

    // STEP 5: Analyze products with Gemini
    console.log(`\n🖼️  Starting image analysis with Gemini...`);
    let analyzed = 0;
    let failed = 0;
    let geminiApiCalls = 0;
    const errors: string[] = [];

    for (const product of productsToAnalyze) {
      try {
        // Skip products without images
        if (!product.imageUrl) {
          console.log(`⏭ Skipping ${product.title} (no image)`);
          continue;
        }

        console.log(`\n🔍 Analyzing [${analyzed + failed + 1}/${productsToAnalyze.length}]: ${product.title}`);

        // Analyze image with Gemini
        const analysis = await analyzeProductImage(
          product.imageUrl,
          shop,
          product.title
        );

        geminiApiCalls++;

        if (!analysis) {
          console.error(`❌ Analysis failed for ${product.title}`);
          failed++;
          errors.push(`Failed to analyze: ${product.title}`);
          continue;
        }

        // Save to database
        const saved = await saveAnalyzedProduct(shop, product, analysis);

        if (saved) {
          analyzed++;
          console.log(`✅ Saved analysis for ${product.title}`);
        } else {
          failed++;
          errors.push(`Failed to save: ${product.title}`);
        }

        // Rate limiting: Add small delay between API calls
        if (geminiApiCalls % 10 === 0) {
          console.log(`⏸️  Pausing briefly after ${geminiApiCalls} API calls...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${product.title}:`, error.message);
        failed++;
        errors.push(`Error: ${product.title} - ${error.message}`);
      }
    }

    // STEP 6: Calculate costs
    // Gemini 2.0 Flash pricing:
    // - Input: $0.10 per 1M tokens
    // - Output: $0.40 per 1M tokens
    // - Images: ~258 tokens each (fixed)
    // - Output per analysis: ~5000 tokens (estimated)
    const tokensPerImage = 258;
    const tokensPerOutput = 5000;
    const inputCost = (geminiApiCalls * tokensPerImage * 0.10) / 1000000;
    const outputCost = (geminiApiCalls * tokensPerOutput * 0.40) / 1000000;
    const totalCost = inputCost + outputCost;

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ ADMIN REFRESH COMPLETED in ${elapsedTime}s`);
    console.log(`${"=".repeat(60)}`);
    console.log(`📊 Statistics:`);
    console.log(`   - Products fetched: ${products.length}`);
    console.log(`   - Products analyzed: ${analyzed}`);
    console.log(`   - Products failed: ${failed}`);
    console.log(`   - Gemini API calls: ${geminiApiCalls}`);
    console.log(`   - Estimated cost: $${totalCost.toFixed(4)}`);
    console.log(`${"=".repeat(60)}\n`);

    // STEP 7: Log activity
    await logRefreshActivity(
      shop,
      "admin_manual",
      products.length,
      analyzed,
      geminiApiCalls,
      totalCost,
      "completed",
      errors.length > 0 ? errors.join("; ") : undefined
    );

    return json({
      success: true,
      productsFetched: products.length,
      productsAnalyzed: analyzed,
      productsFailed: failed,
      geminiApiCalls,
      estimatedCost: totalCost,
      errors: errors.length > 0 ? errors : undefined,
      elapsedTime: parseFloat(elapsedTime),
    });
  } catch (error: any) {
    console.error("❌ CRITICAL ERROR in admin refresh:", error);

    // Try to log the error
    try {
      const { session } = await authenticate.admin(request);
      await logRefreshActivity(
        session.shop,
        "admin_manual",
        0,
        0,
        0,
        0,
        "failed",
        error.message
      );
    } catch (logError) {
      console.error("❌ Failed to log error:", logError);
    }

    return json(
      {
        error: "Internal server error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
