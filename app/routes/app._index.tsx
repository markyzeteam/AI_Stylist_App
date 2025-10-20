import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useNavigate, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Banner,
  Divider,
  List,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Import refresh functions
    const {
      fetchShopifyProducts,
      analyzeProductImage,
      saveAnalyzedProduct,
      saveBasicProduct,
      logRefreshActivity,
      loadGeminiSettings,
    } = await import("../utils/geminiAnalysis");
    const {
      canMakeRequest,
      recordRequest,
      waitIfNeeded,
      getRemainingQuota,
      formatWaitTime,
    } = await import("../utils/rateLimiter");
    const { db } = await import("../db.server");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 ADMIN REFRESH STARTED for ${shop}`);
    console.log(`${"=".repeat(60)}\n`);

    const startTime = Date.now();

    // STEP 1: Load settings
    const settings = await loadGeminiSettings(shop);
    const useImageAnalysis = settings.useImageAnalysis ?? true;
    const rateLimitConfig = {
      requestsPerMinute: settings.requestsPerMinute || 15,
      requestsPerDay: settings.requestsPerDay || 1500,
      batchSize: settings.batchSize || 10,
      enableRateLimiting: settings.enableRateLimiting ?? true,
    };

    console.log(`⚙️ Settings:`);
    console.log(`   Image Analysis: ${useImageAnalysis ? 'ON' : 'OFF (Basic Mode)'}`);
    console.log(`   RPM: ${rateLimitConfig.requestsPerMinute}`);
    console.log(`   RPD: ${rateLimitConfig.requestsPerDay}`);
    console.log(`   Batch Size: ${rateLimitConfig.batchSize}`);
    console.log(`   Rate Limiting: ${rateLimitConfig.enableRateLimiting}\n`);

    // STEP 2: Fetch products
    console.log(`\n📦 Fetching products from Shopify...`);
    const products = await fetchShopifyProducts(shop);

    if (products.length === 0) {
      console.warn(`⚠ No products found`);
      await logRefreshActivity(shop, "admin_manual", 0, 0, 0, 0, "completed", "No products found");
      return json({
        success: true,
        message: "No products found in store",
        productsFetched: 0,
        productsAnalyzed: 0,
      });
    }

    console.log(`✅ Fetched ${products.length} products`);

    // STEP 3: Filter out already-processed products (incremental update)
    console.log(`\n🔍 Checking which products need processing...`);

    // Use the appropriate table based on useImageAnalysis setting
    const existingProducts = useImageAnalysis
      ? await db.filteredSelectionWithImgAnalyzed.findMany({
          where: { shop },
          select: {
            shopifyProductId: true,
            imageUrl: true,
            title: true,
          },
        })
      : await db.filteredSelection.findMany({
          where: { shop },
          select: {
            shopifyProductId: true,
            imageUrl: true,
            title: true,
          },
        });

    const existingMap = new Map(
      existingProducts.map(p => [p.shopifyProductId, p])
    );

    // Filter: only analyze if product is NEW or image/title changed
    const productsToAnalyze = products.filter(product => {
      const existing = existingMap.get(product.id);

      if (!existing) {
        return true; // New product
      }

      // Check if image or title changed
      const imageChanged = existing.imageUrl !== product.imageUrl;
      const titleChanged = existing.title !== product.title;

      return imageChanged || titleChanged;
    });

    console.log(`📊 Processing summary:`);
    console.log(`   Total products: ${products.length}`);
    console.log(`   Already processed: ${products.length - productsToAnalyze.length}`);
    console.log(`   Need processing: ${productsToAnalyze.length}`);
    console.log(`   Mode: ${useImageAnalysis ? 'AI Image Analysis' : 'Basic (No AI)'}`);

    if (productsToAnalyze.length === 0) {
      console.log(`\n✅ All products are already processed! No work needed.`);
      await logRefreshActivity(shop, "admin_manual", products.length, 0, 0, 0, "completed", "All products already processed");
      return json({
        success: true,
        message: `All ${products.length} products are already processed! No updates needed.`,
        productsFetched: products.length,
        productsAnalyzed: 0,
        productsSkipped: products.length,
      });
    }

    // STEP 4: Process only new/updated products
    const processingMode = useImageAnalysis ? 'with AI image analysis' : 'in basic mode (no AI)';
    console.log(`\n${useImageAnalysis ? '🖼️' : '⚡'}  Processing ${productsToAnalyze.length} new/updated products ${processingMode}...\n`);

    let analyzed = 0;
    let failed = 0;
    let skippedNoImage = 0;
    let geminiApiCalls = 0;
    const totalProducts = productsToAnalyze.length;
    let currentBatch = 0;

    for (let i = 0; i < productsToAnalyze.length; i++) {
      const product = productsToAnalyze[i];

      try {
        if (!product.imageUrl) {
          console.log(`⏭ [${i + 1}/${totalProducts}] Skipping ${product.title} (no image)`);
          skippedNoImage++;
          continue;
        }

        // Check if we should wait for rate limits (before each batch) - ONLY in AI mode
        if (useImageAnalysis && i % rateLimitConfig.batchSize === 0) {
          currentBatch++;
          const quota = getRemainingQuota(shop, rateLimitConfig);

          console.log(`\n📊 [Batch ${currentBatch}] Rate Limit Status:`);
          console.log(`   Requests this minute: ${quota.requestsThisMinute}/${rateLimitConfig.requestsPerMinute}`);
          console.log(`   Requests today: ${quota.requestsToday}/${rateLimitConfig.requestsPerDay}`);
          console.log(`   Remaining today: ${quota.remainingDay}`);

          // Wait if needed
          try {
            await waitIfNeeded(shop, rateLimitConfig, (waitTimeMs, reason) => {
              console.log(`\n⏸ ${reason}`);
              console.log(`   Pausing for ${formatWaitTime(waitTimeMs)}...`);
            });
          } catch (error: any) {
            // Daily limit reached
            console.error(`\n❌ ${error.message}`);
            console.log(`   Processed ${analyzed} of ${totalProducts} products before limit`);

            await logRefreshActivity(
              shop,
              "admin_manual",
              totalProducts,
              analyzed,
              geminiApiCalls,
              0,
              "partial",
              error.message
            );

            return json({
              success: false,
              message: `Daily API limit reached. Analyzed ${analyzed}/${totalProducts} new/updated products. Will resume tomorrow at midnight PT.`,
              productsFetched: products.length,
              productsAnalyzed: analyzed,
              productsFailed: failed,
              productsSkipped: products.length - productsToAnalyze.length,
              skippedNoImage,
            });
          }
        }

        if (useImageAnalysis) {
          // AI Image Analysis Mode
          console.log(`🖼️  [${i + 1}/${totalProducts}] Analyzing: ${product.title}`);

          const analysis = await analyzeProductImage(product.imageUrl, shop, product.title);
          geminiApiCalls++;
          recordRequest(shop);

          if (!analysis) {
            console.error(`❌ Analysis failed`);
            failed++;
            continue;
          }

          const saved = await saveAnalyzedProduct(shop, product, analysis);
          if (saved) {
            analyzed++;
            console.log(`✅ Saved with AI analysis (${analyzed}/${totalProducts} completed)`);
          } else {
            failed++;
          }
        } else {
          // Basic Mode (No AI)
          console.log(`⚡ [${i + 1}/${totalProducts}] Saving: ${product.title}`);

          const saved = await saveBasicProduct(shop, product);
          if (saved) {
            analyzed++;
            console.log(`✅ Saved basic data (${analyzed}/${totalProducts} completed)`);
          } else {
            failed++;
          }
        }
      } catch (error: any) {
        console.error(`❌ Error:`, error.message);
        failed++;
      }
    }

    // STEP 4: Calculate costs
    const tokensPerImage = 258;
    const tokensPerOutput = 5000;
    const inputCost = (geminiApiCalls * tokensPerImage * 0.10) / 1000000;
    const outputCost = (geminiApiCalls * tokensPerOutput * 0.40) / 1000000;
    const totalCost = inputCost + outputCost;

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const alreadyAnalyzed = products.length - productsToAnalyze.length;

    console.log(`\n✅ REFRESH COMPLETED in ${elapsedTime}s`);
    console.log(`   Mode: ${useImageAnalysis ? 'AI Image Analysis' : 'Basic (No AI)'}`);
    console.log(`   Total products: ${products.length}`);
    console.log(`   Already processed: ${alreadyAnalyzed}`);
    console.log(`   Newly processed: ${analyzed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped (no image): ${skippedNoImage}`);
    if (useImageAnalysis) {
      console.log(`   API calls: ${geminiApiCalls}`);
      console.log(`   Cost: $${totalCost.toFixed(4)}`);
    }

    // STEP 5: Log activity
    await logRefreshActivity(shop, "admin_manual", products.length, analyzed, geminiApiCalls, totalCost, "completed");

    const successMessage = useImageAnalysis
      ? `Successfully analyzed ${analyzed} new/updated products with AI! (${alreadyAnalyzed} already up-to-date) Cost: $${totalCost.toFixed(4)}`
      : `Successfully saved ${analyzed} new/updated products in basic mode! (${alreadyAnalyzed} already up-to-date) No AI cost.`;

    return json({
      success: true,
      message: successMessage,
      productsFetched: products.length,
      productsAnalyzed: analyzed,
      productsFailed: failed,
      productsSkipped: alreadyAnalyzed,
      skippedNoImage,
      estimatedCost: totalCost,
    });
  } catch (error: any) {
    console.error("❌ Error in refresh:", error);
    return json({
      success: false,
      message: `Error: ${error.message}`,
    }, { status: 500 });
  }
};

export default function Index() {
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "submitting";
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleRefresh = () => {
    if (confirm("This will analyze NEW and UPDATED products in your catalog with Gemini AI. Previously analyzed products will be skipped to save API credits. Continue?")) {
      const formData = new FormData();
      submit(formData, { method: "post" });
    }
  };

  const handleResetRateLimit = async () => {
    if (confirm("Reset today's rate limit counter? (Temporary workaround)")) {
      try {
        const response = await fetch("/api/admin/reset-rate-limit", {
          method: "POST",
        });
        const data = await response.json();
        if (data.success) {
          setResetMessage(`✅ ${data.message}`);
          setTimeout(() => setResetMessage(null), 5000);
        } else {
          setResetMessage(`❌ ${data.message}`);
        }
      } catch (error) {
        setResetMessage("❌ Failed to reset rate limit");
      }
    }
  };

  return (
    <Page>
      <TitleBar title="YZE Shopping AI - Body Shape Advisor" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData?.success && (
              <Banner tone="success">
                <Text as="p" variant="bodyMd">
                  {actionData.message}
                </Text>
              </Banner>
            )}

            {actionData?.success === false && (
              <Banner tone="critical">
                <Text as="p" variant="bodyMd">
                  {actionData.message}
                </Text>
              </Banner>
            )}

            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  🎉 Upgraded to Gemini 2.0 Flash
                </Text>
                <Text as="p" variant="bodyMd">
                  Your app now uses Google Gemini AI for image analysis and recommendations - <strong>96% cheaper</strong> than before!
                </Text>
              </BlockStack>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Welcome to YZE Shopping AI
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Your intelligent body shape advisor powered by Google Gemini AI
                </Text>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    🎯 How It Works
                  </Text>
                  <List>
                    <List.Item>Gemini analyzes your product images (colors, style, silhouette)</List.Item>
                    <List.Item>Customers use the body shape calculator on your storefront</List.Item>
                    <List.Item>They receive AI-powered personalized recommendations</List.Item>
                    <List.Item>Get specific size suggestions based on their measurements</List.Item>
                  </List>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    🔄 Product Refresh
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Analyzes ALL products in your catalog with Gemini AI. The system automatically respects API rate limits and will pause/resume as needed.
                  </Text>
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Rate limiting is configured in <strong>Gemini AI Settings</strong>. Default: Free tier (15 RPM, 1,500 RPD)
                    </Text>
                  </Banner>
                  {resetMessage && (
                    <Banner tone={resetMessage.includes("✅") ? "success" : "critical"}>
                      <Text as="p" variant="bodyMd">{resetMessage}</Text>
                    </Banner>
                  )}
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      onClick={handleRefresh}
                      loading={isRefreshing}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "Refreshing..." : "Refresh Products Now"}
                    </Button>
                    <Button
                      onClick={handleResetRateLimit}
                      tone="critical"
                    >
                      Reset Rate Limit (Temp Fix)
                    </Button>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    ⚙️ Configuration
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Configure your Gemini API key and app settings
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => navigate('/app/gemini-settings')}>
                      Gemini AI Settings
                    </Button>
                    <Button onClick={() => navigate('/app/settings')}>
                      App Settings
                    </Button>
                    <Button onClick={() => navigate('/app/analysis-results')}>
                      View Analysis Results
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  📱 For Customers
                </Text>
                <Text as="p" variant="bodyMd">
                  The body shape advisor is available as an app block in your theme. Customers can access it directly from your storefront to get personalized recommendations.
                </Text>
              </BlockStack>
            </Banner>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  📊 Features
                </Text>
                <List>
                  <List.Item>Body shape calculator</List.Item>
                  <List.Item>Smart product matching</List.Item>
                  <List.Item>Size recommendations from descriptions</List.Item>
                  <List.Item>Configurable suggestion count</List.Item>
                  <List.Item>Match score threshold</List.Item>
                </List>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  💡 Tips
                </Text>
                <List>
                  <List.Item>Include size charts in product descriptions</List.Item>
                  <List.Item>Tag products with style keywords (a-line, v-neck, etc.)</List.Item>
                  <List.Item>Use descriptive product types</List.Item>
                  <List.Item>Keep product descriptions detailed</List.Item>
                </List>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
