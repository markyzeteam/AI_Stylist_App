import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Index() {
  const navigate = useNavigate();

  return (
    <Page>
      <TitleBar title="YZE Shopping AI - Body Shape Advisor" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Welcome to YZE Shopping AI
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Your intelligent body shape advisor for personalized product recommendations
                </Text>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    🎯 How It Works
                  </Text>
                  <List>
                    <List.Item>Customers use the body shape calculator on your storefront</List.Item>
                    <List.Item>They receive personalized clothing recommendations</List.Item>
                    <List.Item>Get specific size suggestions based on their measurements</List.Item>
                    <List.Item>Scans ALL available products in your store</List.Item>
                  </List>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    ⚙️ Configuration
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Customize how the app recommends products to your customers
                  </Text>
                  <Button variant="primary" onClick={() => navigate('/app/settings')}>
                    Go to Settings
                  </Button>
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