import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Divider,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { loadSettings, saveSettings, type AppSettings } from "../utils/settings";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Load settings from Shopify metafields
  const settings = await loadSettings(admin);

  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const settings: AppSettings = {
    numberOfSuggestions: parseInt(formData.get("numberOfSuggestions") as string) || 30,
    minimumMatchScore: parseInt(formData.get("minimumMatchScore") as string) || 30,
    maxProductsToScan: parseInt(formData.get("maxProductsToScan") as string) || 1000,
    onlyInStockProducts: formData.get("onlyInStockProducts") === "true",
    enableImageAnalysis: formData.get("enableImageAnalysis") === "true",
    maxRefreshesPerDay: parseInt(formData.get("maxRefreshesPerDay") as string) || 3,
  };

  // Save settings to Shopify metafields
  const metafieldSuccess = await saveSettings(admin, settings);

  // Also save to database session for the API endpoint
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Update ALL sessions for this shop to ensure consistency
    const updateResult = await prisma.session.updateMany({
      where: { shop },
      data: {
        appSettings: JSON.stringify(settings)
      }
    });

    console.log(`✅ Settings saved to ${updateResult.count} database session(s) for shop: ${shop}`);
    console.log(`📊 Saved settings:`, settings);
  } catch (dbError) {
    console.error("Failed to save settings to database:", dbError);
  }

  if (metafieldSuccess) {
    return json({
      success: true,
      settings,
      message: "Settings saved successfully!"
    });
  } else {
    return json({
      success: false,
      settings,
      message: "Failed to save settings. Please try again."
    }, { status: 500 });
  }
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [formData, setFormData] = useState(settings);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="App Settings" />
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

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Product Recommendation Settings
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure how the body shape advisor recommends products to customers
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <input type="hidden" name="numberOfSuggestions" value={formData.numberOfSuggestions} />
                    <TextField
                      label="Number of Suggestions"
                      type="number"
                      value={formData.numberOfSuggestions.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, numberOfSuggestions: parseInt(value) || 30 })
                      }
                      helpText="How many products to show in recommendations (1-100)"
                      autoComplete="off"
                      min={1}
                      max={100}
                    />

                    <input type="hidden" name="minimumMatchScore" value={formData.minimumMatchScore} />
                    <TextField
                      label="Minimum Match Score (%)"
                      type="number"
                      value={formData.minimumMatchScore.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, minimumMatchScore: parseInt(value) || 30 })
                      }
                      helpText="Minimum suitability score to show a product (0-100)"
                      autoComplete="off"
                      min={0}
                      max={100}
                    />

                    <input type="hidden" name="maxProductsToScan" value={formData.maxProductsToScan} />
                    <TextField
                      label="Maximum Products to Scan"
                      type="number"
                      value={formData.maxProductsToScan.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, maxProductsToScan: parseInt(value) || 0 })
                      }
                      helpText="Maximum number of products to scan (0 = ALL products, 100-10000 = limit). Set to 0 to scan your entire catalog."
                      autoComplete="off"
                      min={0}
                      max={50000}
                    />

                    <input type="hidden" name="maxRefreshesPerDay" value={formData.maxRefreshesPerDay} />
                    <TextField
                      label="Maximum Refreshes Per Day"
                      type="number"
                      value={formData.maxRefreshesPerDay.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, maxRefreshesPerDay: parseInt(value) || 3 })
                      }
                      helpText="How many times you can run the admin product refresh per day (recommended: 3-5 to manage API costs)"
                      autoComplete="off"
                      min={1}
                      max={24}
                    />

                    <Checkbox
                      label="Only show in-stock products"
                      checked={formData.onlyInStockProducts}
                      onChange={(value) =>
                        setFormData({ ...formData, onlyInStockProducts: value })
                      }
                      helpText="When enabled, only products with available inventory will be recommended. When disabled, all products (including out of stock) will be shown."
                    />
                    <input type="hidden" name="onlyInStockProducts" value={formData.onlyInStockProducts.toString()} />

                    <Checkbox
                      label="Enable Gemini AI Image Analysis"
                      checked={formData.enableImageAnalysis}
                      onChange={(value) =>
                        setFormData({ ...formData, enableImageAnalysis: value })
                      }
                      helpText="When enabled, Gemini AI will analyze product images to provide more accurate style recommendations based on visual features (colors, patterns, cuts, etc.). This provides better matching but may increase processing time."
                    />
                    <input type="hidden" name="enableImageAnalysis" value={formData.enableImageAnalysis.toString()} />

                    <InlineStack align="end">
                      <Button variant="primary" submit>
                        Save Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  How It Works
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    • <strong>Number of Suggestions:</strong> Controls how many product recommendations are shown to customers
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Minimum Match Score:</strong> Products below this score won't be shown (higher = more selective)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Maximum Products to Scan:</strong> Limit how many products to analyze. Set to 0 to scan ALL products in your catalog (recommended). Higher limits = more thorough but slower.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Maximum Refreshes Per Day:</strong> Control how many times you can run the admin product refresh each day to manage API costs and prevent rate limiting
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Only In-Stock Products:</strong> Filter recommendations to only show products that are currently available for purchase
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Gemini AI Image Analysis:</strong> Enable visual analysis of product images for more accurate style matching based on colors, patterns, cuts, and design details
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Banner tone="info">
              <Text as="p" variant="bodyMd">
                <strong>Note:</strong> Settings are saved to your Shopify store and will persist across app restarts. The storefront will use these settings for product recommendations.
              </Text>
            </Banner>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Current Configuration
              </Text>
              <Divider />
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Suggestions:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.numberOfSuggestions}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Min Score:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.minimumMatchScore}%
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Max Scan:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.maxProductsToScan === 0 ? 'ALL Products' : formData.maxProductsToScan}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Max Refreshes/Day:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.maxRefreshesPerDay}x
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Stock Filter:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.onlyInStockProducts ? "In-Stock Only" : "All Products"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Image Analysis:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.enableImageAnalysis ? "Enabled" : "Disabled"}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
