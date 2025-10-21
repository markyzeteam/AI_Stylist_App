import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  InlineStack,
  Button,
  Banner,
  Modal,
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

  // Get total count of analyzed products
  const totalScannedCount = await db.filteredSelectionWithImgAnalyzed.count({
    where: { shop },
  });

  // Fetch total products from Shopify using the admin API
  const { admin } = await authenticate.admin(request);
  let totalProductsCount = 0;

  try {
    const response = await admin.graphql(
      `#graphql
      query {
        productsCount {
          count
        }
      }`
    );
    const data = await response.json();
    totalProductsCount = data.data.productsCount.count;
  } catch (error) {
    console.error("Error fetching total products count:", error);
  }

  // Parse the JSON analysis for each product
  const parsedProducts = products.map(product => {
    let analysis = null;
    try {
      // geminiAnalysis is already a JSON field in Prisma, no need to parse
      if (product.geminiAnalysis) {
        const rawAnalysis = product.geminiAnalysis as any;

        // Map all database fields to UI fields separately
        analysis = {
          colors: rawAnalysis.detectedColors || [],
          colorSeasons: rawAnalysis.colorSeasons || [],
          style: rawAnalysis.styleClassification || [],
          silhouette: rawAnalysis.silhouetteType || null,
          fabric: rawAnalysis.fabricTexture || null,
          pattern: rawAnalysis.patternType || null,
          details: rawAnalysis.designDetails || [],
          additionalNotes: rawAnalysis.additionalNotes || product.additionalNotes || null,
        };
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

  return json({
    products: parsedProducts,
    totalScannedCount,
    totalProductsCount,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Delete all product analysis for this shop
    const result = await db.filteredSelectionWithImgAnalyzed.deleteMany({
      where: { shop },
    });

    console.log(`🗑️ Cleared ${result.count} product analyses for ${shop}`);

    return json({
      success: true,
      message: `Successfully cleared ${result.count} product analyses`,
      count: result.count,
    });
  } catch (error: any) {
    console.error("❌ Error clearing analysis:", error);
    return json(
      {
        success: false,
        message: `Error: ${error.message}`,
      },
      { status: 500 }
    );
  }
};

export default function AnalysisResults() {
  const { products, totalScannedCount, totalProductsCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [isClearing, setIsClearing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [modalActive, setModalActive] = useState(false);

  const scanPercentage = totalProductsCount > 0
    ? ((totalScannedCount / totalProductsCount) * 100).toFixed(1)
    : "0";

  const handleClearAll = async () => {
    if (
      confirm(
        `Are you sure you want to clear ALL ${products.length} product analyses? This cannot be undone.`
      )
    ) {
      setIsClearing(true);
      const form = document.createElement("form");
      form.method = "POST";
      document.body.appendChild(form);
      form.submit();
    }
  };

  const handleProductClick = (product: typeof products[0]) => {
    setSelectedProduct(product);
    setModalActive(true);
  };

  const handleModalClose = () => {
    setModalActive(false);
    setSelectedProduct(null);
  };

  return (
    <Page>
      <TitleBar title="Gemini Analysis Results" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData?.success && (
              <Banner tone="success" onDismiss={() => window.location.reload()}>
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
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Product Analysis Results
                    </Text>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Showing {products.length} most recent of {totalScannedCount} total analyzed products
                      </Text>
                      <InlineStack gap="200" align="start">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {totalScannedCount} / {totalProductsCount} products scanned
                        </Text>
                        <Badge tone={parseFloat(scanPercentage) >= 80 ? "success" : parseFloat(scanPercentage) >= 50 ? "attention" : "info"}>
                          {scanPercentage}% complete
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                  {products.length > 0 && (
                    <Button
                      tone="critical"
                      onClick={handleClearAll}
                      loading={isClearing}
                      disabled={isClearing}
                    >
                      Clear All Analysis
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>

            {products.map((product) => (
              <div key={product.id} onClick={() => handleProductClick(product)} style={{ cursor: "pointer" }}>
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingMd">
                          {product.title}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Click to view details →
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Type: {product.productType || "N/A"} • Last Updated: {product.lastUpdated ? new Date(product.lastUpdated).toLocaleString() : "N/A"}
                      </Text>
                    </BlockStack>

                    {product.analysis ? (
                      <BlockStack gap="200">
                        <InlineStack gap="200" wrap>
                          {product.analysis.colors && product.analysis.colors.length > 0 && (
                            <>
                              <Text as="span" variant="bodySm">🎨</Text>
                              {product.analysis.colors.slice(0, 3).map((color: string, idx: number) => (
                                <Badge key={idx}>{color}</Badge>
                              ))}
                              {product.analysis.colors.length > 3 && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  +{product.analysis.colors.length - 3} more
                                </Text>
                              )}
                            </>
                          )}
                        </InlineStack>
                        <InlineStack gap="200" wrap>
                          {product.analysis.silhouette && (
                            <>
                              <Text as="span" variant="bodySm">✨</Text>
                              <Badge tone="success">{product.analysis.silhouette}</Badge>
                            </>
                          )}
                          {product.analysis.pattern && (
                            <>
                              <Text as="span" variant="bodySm">📐</Text>
                              <Badge tone="magic">{product.analysis.pattern}</Badge>
                            </>
                          )}
                          {product.analysis.style && product.analysis.style.length > 0 && (
                            <>
                              <Text as="span" variant="bodySm">👗</Text>
                              {product.analysis.style.slice(0, 2).map((style: string, idx: number) => (
                                <Badge key={idx} tone="info">{style}</Badge>
                              ))}
                              {product.analysis.style.length > 2 && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  +{product.analysis.style.length - 2} more
                                </Text>
                              )}
                            </>
                          )}
                        </InlineStack>
                      </BlockStack>
                    ) : (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        No analysis data available
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              </div>
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

      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title={selectedProduct?.title || "Product Details"}
        primaryAction={{
          content: "Close",
          onAction: handleModalClose,
        }}
      >
        <Modal.Section>
          {selectedProduct && (
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  <strong>Product Type:</strong> {selectedProduct.productType || "N/A"}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  <strong>Last Updated:</strong>{" "}
                  {selectedProduct.lastUpdated
                    ? new Date(selectedProduct.lastUpdated).toLocaleString()
                    : "N/A"}
                </Text>
              </BlockStack>

              {selectedProduct.analysis ? (
                <BlockStack gap="400">
                  {/* Colors */}
                  {selectedProduct.analysis.colors &&
                    selectedProduct.analysis.colors.length > 0 && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          🎨 Colors
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <InlineStack gap="200" wrap>
                            {selectedProduct.analysis.colors.map((color: string, idx: number) => (
                              <Badge key={idx}>{color}</Badge>
                            ))}
                          </InlineStack>
                        </div>
                      </div>
                    )}

                  {/* Color Seasons */}
                  {selectedProduct.analysis.colorSeasons &&
                    selectedProduct.analysis.colorSeasons.length > 0 && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          🌸 Color Seasons
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <InlineStack gap="200" wrap>
                            {selectedProduct.analysis.colorSeasons.map((season: string, idx: number) => (
                              <Badge key={idx} tone="attention">
                                {season}
                              </Badge>
                            ))}
                          </InlineStack>
                        </div>
                      </div>
                    )}

                  {/* Style Classification */}
                  {selectedProduct.analysis.style &&
                    selectedProduct.analysis.style.length > 0 && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          👗 Style
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <InlineStack gap="200" wrap>
                            {selectedProduct.analysis.style.map((style: string, idx: number) => (
                              <Badge key={idx} tone="info">
                                {style}
                              </Badge>
                            ))}
                          </InlineStack>
                        </div>
                      </div>
                    )}

                  {/* Silhouette */}
                  {selectedProduct.analysis.silhouette && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          ✨ Silhouette
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <Badge tone="success">{selectedProduct.analysis.silhouette}</Badge>
                        </div>
                      </div>
                    )}

                  {/* Pattern Type */}
                  {selectedProduct.analysis.pattern && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          📐 Pattern
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <Badge tone="magic">{selectedProduct.analysis.pattern}</Badge>
                        </div>
                      </div>
                    )}

                  {/* Fabric Texture */}
                  {selectedProduct.analysis.fabric && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          🧵 Fabric
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <Text as="p" variant="bodyMd">
                            {selectedProduct.analysis.fabric}
                          </Text>
                        </div>
                      </div>
                    )}

                  {/* Design Details */}
                  {selectedProduct.analysis.details &&
                    selectedProduct.analysis.details.length > 0 && (
                      <div>
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          ✂️ Design Details
                        </Text>
                        <div style={{ marginTop: "12px" }}>
                          <InlineStack gap="200" wrap>
                            {selectedProduct.analysis.details.map((detail: string, idx: number) => (
                              <Badge key={idx} tone="read-only">
                                {detail}
                              </Badge>
                            ))}
                          </InlineStack>
                        </div>
                      </div>
                    )}

                  {/* Additional Notes */}
                  {selectedProduct.analysis.additionalNotes && (
                    <div>
                      <Text as="p" variant="headingSm" fontWeight="semibold">
                        📝 Additional Notes
                      </Text>
                      <div style={{ marginTop: "12px" }}>
                        <Text as="p" variant="bodyMd" breakWord>
                          {selectedProduct.analysis.additionalNotes}
                        </Text>
                      </div>
                    </div>
                  )}
                </BlockStack>
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No analysis data available for this product.
                </Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
