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
  const { session, admin } = await authenticate.admin(request);

  // Call the admin refresh endpoint
  const response = await fetch(
    `${process.env.SHOPIFY_APP_URL || 'http://localhost'}/api/admin/refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (response.ok) {
    return json({
      success: true,
      message: `Successfully refreshed! Analyzed ${data.productsAnalyzed} products. Cost: $${data.estimatedCost?.toFixed(4) || '0.0000'}`,
      data,
    });
  } else {
    return json({
      success: false,
      message: data.message || data.error || 'Failed to refresh products',
      data,
    }, { status: response.status });
  }
};

export default function Index() {
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "submitting";

  const handleRefresh = () => {
    if (confirm("This will analyze your products with Gemini AI. Continue?")) {
      const formData = new FormData();
      submit(formData, { method: "post" });
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
                  <Button
                    variant="primary"
                    onClick={handleRefresh}
                    loading={isRefreshing}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh Products Now"}
                  </Button>
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
