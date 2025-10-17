import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch analyzed products
  const products = await db.filteredSelectionWithImgAnalyzed.findMany({
    where: { shop },
    orderBy: { lastUpdated: "desc" },
    take: 50,
  });

  // Parse the JSON analysis for each product
  const parsedProducts = products.map(product => {
    let analysis = null;
    try {
      // geminiAnalysis is already a JSON field in Prisma, no need to parse
      if (product.geminiAnalysis) {
        analysis = product.geminiAnalysis;
      }
    } catch (e) {
      console.error("Failed to parse analysis JSON for", product.title);
    }

    return {
      id: product.shopifyProductId,
      title: product.title,
      productType: product.productType,
      analysis,
      lastUpdated: product.lastUpdated?.toISOString(),
    };
  });

  return json({ products: parsedProducts });
};

export default function AnalysisResults() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Gemini Analysis Results" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Product Analysis Results
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Showing {products.length} analyzed products with Gemini AI
                </Text>
              </BlockStack>
            </Card>

            {products.map((product) => (
              <Card key={product.id}>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      {product.title}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Type: {product.productType || "N/A"} • Last Updated: {product.lastUpdated ? new Date(product.lastUpdated).toLocaleString() : "N/A"}
                    </Text>
                  </BlockStack>

                  {product.analysis ? (
                    <BlockStack gap="300">
                      {product.analysis.colors && product.analysis.colors.length > 0 && (
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            🎨 Colors:
                          </Text>
                          <div style={{ marginTop: "8px" }}>
                            <InlineStack gap="200" wrap>
                              {product.analysis.colors.map((color: string, idx: number) => (
                                <Badge key={idx}>{color}</Badge>
                              ))}
                            </InlineStack>
                          </div>
                        </div>
                      )}

                      {product.analysis.style && product.analysis.style.length > 0 && (
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            👗 Style:
                          </Text>
                          <div style={{ marginTop: "8px" }}>
                            <InlineStack gap="200" wrap>
                              {product.analysis.style.map((style: string, idx: number) => (
                                <Badge key={idx} tone="info">{style}</Badge>
                              ))}
                            </InlineStack>
                          </div>
                        </div>
                      )}

                      {product.analysis.silhouette && product.analysis.silhouette.length > 0 && (
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            ✨ Silhouette:
                          </Text>
                          <div style={{ marginTop: "8px" }}>
                            <InlineStack gap="200" wrap>
                              {product.analysis.silhouette.map((silhouette: string, idx: number) => (
                                <Badge key={idx} tone="success">{silhouette}</Badge>
                              ))}
                            </InlineStack>
                          </div>
                        </div>
                      )}

                      {product.analysis.description && (
                        <div>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            📝 Description:
                          </Text>
                          <Text as="p" variant="bodyMd" tone="subdued" breakWord>
                            {product.analysis.description}
                          </Text>
                        </div>
                      )}
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No analysis data available
                    </Text>
                  )}
                </BlockStack>
              </Card>
            ))}

            {products.length === 0 && (
              <Card>
                <Text as="p" variant="bodyMd">
                  No analyzed products found. Run a product refresh to analyze your catalog with Gemini AI.
                </Text>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
