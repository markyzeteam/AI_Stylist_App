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
      logRefreshActivity,
    } = await import("../utils/geminiAnalysis");
    const { db } = await import("../db.server");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 ADMIN REFRESH STARTED for ${shop}`);
    console.log(`${"=".repeat(60)}\n`);

    const startTime = Date.now();

    // STEP 1: Check rate limiting (3x per day)
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

    console.log(`📊 Refreshes today: ${refreshesToday}/3`);

    if (refreshesToday >= 3) {
      console.warn(`⚠ Rate limit reached: ${refreshesToday} refreshes today`);
      return json({
        success: false,
        message: `Rate limit reached: ${refreshesToday}/3 refreshes today. Try again tomorrow.`,
      }, { status: 429 });
    }

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

    // STEP 3: Get existing analyzed products
    const existingAnalyzed = await db.filteredSelectionWithImgAnalyzed.findMany({
      where: { shop },
      select: { shopifyProductId: true, lastUpdated: true },
    });

    const analyzedMap = new Map(
      existingAnalyzed.map(p => [p.shopifyProductId, p.lastUpdated])
    );

    // STEP 4: Filter products needing analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const productsToAnalyze = products.filter(p => {
      const lastAnalyzed = analyzedMap.get(p.id);
      if (!lastAnalyzed) return true; // Not analyzed yet
      if (lastAnalyzed < thirtyDaysAgo) return true; // Old analysis
      return false;
    });

    console.log(`📊 Products needing analysis: ${productsToAnalyze.length}`);

    if (productsToAnalyze.length === 0) {
      console.log(`✅ All products up-to-date`);
      await logRefreshActivity(shop, "admin_manual", products.length, 0, 0, 0, "completed", "All up-to-date");
      return json({
        success: true,
        message: "All products are up-to-date!",
        productsFetched: products.length,
        productsAnalyzed: 0,
      });
    }

    // STEP 5: Analyze products (limit to 10 for quick testing)
    const productsToProcess = productsToAnalyze.slice(0, 10);
    console.log(`\n🖼️  Analyzing ${productsToProcess.length} products...`);

    let analyzed = 0;
    let failed = 0;
    let geminiApiCalls = 0;

    for (const product of productsToProcess) {
      try {
        if (!product.imageUrl) {
          console.log(`⏭ Skipping ${product.title} (no image)`);
          continue;
        }

        console.log(`🔍 Analyzing: ${product.title}`);
        const analysis = await analyzeProductImage(product.imageUrl, shop, product.title);
        geminiApiCalls++;

        if (!analysis) {
          console.error(`❌ Analysis failed`);
          failed++;
          continue;
        }

        const saved = await saveAnalyzedProduct(shop, product, analysis);
        if (saved) {
          analyzed++;
          console.log(`✅ Saved`);
        } else {
          failed++;
        }
      } catch (error: any) {
        console.error(`❌ Error:`, error.message);
        failed++;
      }
    }

    // STEP 6: Calculate costs
    const tokensPerImage = 258;
    const tokensPerOutput = 5000;
    const inputCost = (geminiApiCalls * tokensPerImage * 0.10) / 1000000;
    const outputCost = (geminiApiCalls * tokensPerOutput * 0.40) / 1000000;
    const totalCost = inputCost + outputCost;

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ REFRESH COMPLETED in ${elapsedTime}s`);
    console.log(`   Analyzed: ${analyzed}, Failed: ${failed}, Cost: $${totalCost.toFixed(4)}`);

    // STEP 7: Log activity
    await logRefreshActivity(shop, "admin_manual", products.length, analyzed, geminiApiCalls, totalCost, "completed");

    return json({
      success: true,
      message: `Successfully analyzed ${analyzed} products! Cost: $${totalCost.toFixed(4)}`,
      productsFetched: products.length,
      productsAnalyzed: analyzed,
      productsFailed: failed,
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
    if (confirm("This will analyze your products with Gemini AI. Continue?")) {
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
                    Run a product refresh to analyze your catalog with Gemini AI (limit: 3x per day)
                  </Text>
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
