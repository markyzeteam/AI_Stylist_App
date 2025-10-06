import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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

// Default settings
const DEFAULT_SETTINGS = {
  numberOfSuggestions: 30,
  minimumMatchScore: 30,
  maxProductsToScan: 1000,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // In a real app, you'd load these from a database
  // For now, return defaults
  return json({ settings: DEFAULT_SETTINGS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const settings = {
    numberOfSuggestions: parseInt(formData.get("numberOfSuggestions") as string) || 30,
    minimumMatchScore: parseInt(formData.get("minimumMatchScore") as string) || 30,
    maxProductsToScan: parseInt(formData.get("maxProductsToScan") as string) || 1000,
  };

  // In a real app, you'd save these to a database
  // For now, just return success
  return json({
    success: true,
    settings,
    message: "Settings saved successfully! Note: These settings are currently stored in-memory only. To persist them, you'll need to implement database storage."
  });
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [formData, setFormData] = useState(settings);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, { method: "post" });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <Page>
      <TitleBar title="App Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {showSuccess && (
              <Banner tone="success">
                <Text as="p" variant="bodyMd">
                  Settings saved successfully!
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
                <strong>Note:</strong> These settings currently apply to the admin preview only. To make them work on the storefront, you'll need to implement a settings API endpoint.
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
