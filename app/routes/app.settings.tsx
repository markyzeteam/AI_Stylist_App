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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { loadSettings, saveSettings, type AppSettings } from "../utils/settings";

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
  };

  // Save settings to Shopify metafields
  const success = await saveSettings(admin, settings);

  if (success) {
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
                    <TextField
                      label="Number of Suggestions"
                      type="number"
                      name="numberOfSuggestions"
                      value={formData.numberOfSuggestions.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, numberOfSuggestions: parseInt(value) || 30 })
                      }
                      helpText="How many products to show in recommendations (1-100)"
                      autoComplete="off"
                      min={1}
                      max={100}
                    />

                    <TextField
                      label="Minimum Match Score (%)"
                      type="number"
                      name="minimumMatchScore"
                      value={formData.minimumMatchScore.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, minimumMatchScore: parseInt(value) || 30 })
                      }
                      helpText="Minimum suitability score to show a product (0-100)"
                      autoComplete="off"
                      min={0}
                      max={100}
                    />

                    <TextField
                      label="Maximum Products to Scan"
                      type="number"
                      name="maxProductsToScan"
                      value={formData.maxProductsToScan.toString()}
                      onChange={(value) =>
                        setFormData({ ...formData, maxProductsToScan: parseInt(value) || 1000 })
                      }
                      helpText="How many products to scan from your store (100-1000)"
                      autoComplete="off"
                      min={100}
                      max={1000}
                    />

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
                    • <strong>Maximum Products to Scan:</strong> How many products from your catalog to analyze (higher = more thorough but slower)
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
                    {formData.maxProductsToScan}
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
