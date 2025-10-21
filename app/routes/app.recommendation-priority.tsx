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
  Button,
  Banner,
  InlineStack,
  Divider,
  Select,
  RangeSlider,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

const STRATEGY_OPTIONS = [
  { label: "Balanced (Default)", value: "balanced" },
  { label: "New Arrivals - Push Recently Added Products", value: "new_arrivals" },
  { label: "Move Inventory - Clear Overstocked Items", value: "move_inventory" },
  { label: "Bestsellers - Promote Top Sellers", value: "bestsellers" },
  { label: "High Margin - Maximize Profit", value: "high_margin" },
  { label: "Seasonal - Focus on Sale Items", value: "seasonal" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch existing settings or create defaults
  let settings = await db.recommendationPrioritySettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    // Create default settings
    settings = await db.recommendationPrioritySettings.create({
      data: {
        shop,
        strategy: "balanced",
        newArrivalBoost: 50,
        lowInventoryBoost: 50,
        lowSalesBoost: 50,
        highMarginBoost: 50,
        onSaleBoost: 50,
        newArrivalDays: 30,
        lowInventoryThreshold: 10,
        lowSalesThreshold: 5,
      },
    });
  }

  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();

  const settings = {
    strategy: formData.get("strategy") as string,
    newArrivalBoost: parseInt(formData.get("newArrivalBoost") as string) || 50,
    lowInventoryBoost: parseInt(formData.get("lowInventoryBoost") as string) || 50,
    lowSalesBoost: parseInt(formData.get("lowSalesBoost") as string) || 50,
    highMarginBoost: parseInt(formData.get("highMarginBoost") as string) || 50,
    onSaleBoost: parseInt(formData.get("onSaleBoost") as string) || 50,
    newArrivalDays: parseInt(formData.get("newArrivalDays") as string) || 30,
    lowInventoryThreshold: parseInt(formData.get("lowInventoryThreshold") as string) || 10,
    lowSalesThreshold: parseInt(formData.get("lowSalesThreshold") as string) || 5,
  };

  try {
    await db.recommendationPrioritySettings.upsert({
      where: { shop },
      update: settings,
      create: { shop, ...settings },
    });

    console.log(`✅ Recommendation priority settings saved for ${shop}:`, settings);

    return json({
      success: true,
      message: "Priority settings saved successfully!",
    });
  } catch (error: any) {
    console.error("❌ Error saving priority settings:", error);
    return json(
      {
        success: false,
        message: `Error: ${error.message}`,
      },
      { status: 500 }
    );
  }
};

export default function RecommendationPriority() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [formData, setFormData] = useState({
    strategy: settings.strategy,
    newArrivalBoost: settings.newArrivalBoost,
    lowInventoryBoost: settings.lowInventoryBoost,
    lowSalesBoost: settings.lowSalesBoost,
    highMarginBoost: settings.highMarginBoost,
    onSaleBoost: settings.onSaleBoost,
    newArrivalDays: settings.newArrivalDays,
    lowInventoryThreshold: settings.lowInventoryThreshold,
    lowSalesThreshold: settings.lowSalesThreshold,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, { method: "post" });
  };

  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case "balanced":
        return "All boost factors work together equally. Great for general recommendations.";
      case "new_arrivals":
        return "Heavily prioritize recently published products (last 30 days). Perfect for showcasing new inventory.";
      case "move_inventory":
        return "Focus on products with high stock levels and low sales. Ideal for clearing overstocked items.";
      case "bestsellers":
        return "Promote products with high sales history. Great for featuring popular items.";
      case "high_margin":
        return "Prioritize products with the highest profit margins. Maximizes revenue per sale.";
      case "seasonal":
        return "Boost products currently on sale or discounted. Perfect for promotions and clearance.";
      default:
        return "";
    }
  };

  return (
    <Page>
      <TitleBar title="Recommendation Priority Settings" />
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
                  Control Which Products Get Recommended First
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Customize how products are prioritized in customer recommendations based on your business goals
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="500">
                    {/* Strategy Selection */}
                    <BlockStack gap="200">
                      <input type="hidden" name="strategy" value={formData.strategy} />
                      <Select
                        label="Priority Strategy"
                        options={STRATEGY_OPTIONS}
                        value={formData.strategy}
                        onChange={(value) =>
                          setFormData({ ...formData, strategy: value })
                        }
                      />
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {getStrategyDescription(formData.strategy)}
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Boost Factors */}
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">
                        Boost Factors (0 = Disabled, 100 = Maximum)
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Fine-tune how much each factor influences product ranking
                      </Text>

                      {/* New Arrival Boost */}
                      <BlockStack gap="200">
                        <input type="hidden" name="newArrivalBoost" value={formData.newArrivalBoost} />
                        <RangeSlider
                          label={`New Arrivals Boost: ${formData.newArrivalBoost}%`}
                          value={formData.newArrivalBoost}
                          onChange={(value) =>
                            setFormData({ ...formData, newArrivalBoost: value })
                          }
                          min={0}
                          max={100}
                          output
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Prioritize products published within the last {formData.newArrivalDays} days
                        </Text>
                      </BlockStack>

                      {/* Low Inventory Boost */}
                      <BlockStack gap="200">
                        <input type="hidden" name="lowInventoryBoost" value={formData.lowInventoryBoost} />
                        <RangeSlider
                          label={`Overstocked Items Boost: ${formData.lowInventoryBoost}%`}
                          value={formData.lowInventoryBoost}
                          onChange={(value) =>
                            setFormData({ ...formData, lowInventoryBoost: value })
                          }
                          min={0}
                          max={100}
                          output
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Promote products with high inventory to move stock
                        </Text>
                      </BlockStack>

                      {/* Low Sales Boost */}
                      <BlockStack gap="200">
                        <input type="hidden" name="lowSalesBoost" value={formData.lowSalesBoost} />
                        <RangeSlider
                          label={`Slow-Moving Items Boost: ${formData.lowSalesBoost}%`}
                          value={formData.lowSalesBoost}
                          onChange={(value) =>
                            setFormData({ ...formData, lowSalesBoost: value })
                          }
                          min={0}
                          max={100}
                          output
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Highlight products with fewer than {formData.lowSalesThreshold} total sales
                        </Text>
                      </BlockStack>

                      {/* High Margin Boost */}
                      <BlockStack gap="200">
                        <input type="hidden" name="highMarginBoost" value={formData.highMarginBoost} />
                        <RangeSlider
                          label={`High Profit Margin Boost: ${formData.highMarginBoost}%`}
                          value={formData.highMarginBoost}
                          onChange={(value) =>
                            setFormData({ ...formData, highMarginBoost: value })
                          }
                          min={0}
                          max={100}
                          output
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Favor products with higher profit margins
                        </Text>
                      </BlockStack>

                      {/* On Sale Boost */}
                      <BlockStack gap="200">
                        <input type="hidden" name="onSaleBoost" value={formData.onSaleBoost} />
                        <RangeSlider
                          label={`Sale Items Boost: ${formData.onSaleBoost}%`}
                          value={formData.onSaleBoost}
                          onChange={(value) =>
                            setFormData({ ...formData, onSaleBoost: value })
                          }
                          min={0}
                          max={100}
                          output
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Promote products currently on sale or discounted
                        </Text>
                      </BlockStack>
                    </BlockStack>

                    <Divider />

                    {/* Thresholds */}
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">
                        Thresholds & Definitions
                      </Text>

                      <input type="hidden" name="newArrivalDays" value={formData.newArrivalDays} />
                      <TextField
                        label="New Arrival Window (Days)"
                        type="number"
                        value={formData.newArrivalDays.toString()}
                        onChange={(value) =>
                          setFormData({ ...formData, newArrivalDays: parseInt(value) || 30 })
                        }
                        helpText="Products published within this many days are considered 'new'"
                        autoComplete="off"
                        min={1}
                        max={365}
                      />

                      <input type="hidden" name="lowInventoryThreshold" value={formData.lowInventoryThreshold} />
                      <TextField
                        label="High Inventory Threshold (Units)"
                        type="number"
                        value={formData.lowInventoryThreshold.toString()}
                        onChange={(value) =>
                          setFormData({ ...formData, lowInventoryThreshold: parseInt(value) || 10 })
                        }
                        helpText="Products with MORE than this inventory count are considered 'overstocked'"
                        autoComplete="off"
                        min={1}
                        max={1000}
                      />

                      <input type="hidden" name="lowSalesThreshold" value={formData.lowSalesThreshold} />
                      <TextField
                        label="Low Sales Threshold (Units Sold)"
                        type="number"
                        value={formData.lowSalesThreshold.toString()}
                        onChange={(value) =>
                          setFormData({ ...formData, lowSalesThreshold: parseInt(value) || 5 })
                        }
                        helpText="Products with FEWER than this many total sales are considered 'slow-moving'"
                        autoComplete="off"
                        min={0}
                        max={100}
                      />
                    </BlockStack>

                    <InlineStack align="end">
                      <Button variant="primary" submit>
                        Save Priority Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  How Priority Strategies Work
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Balanced:</strong> All factors work together equally (50% each). Best for general use.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>New Arrivals:</strong> Automatically sets New Arrival Boost to 100%, others to 25%. Showcases fresh inventory.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Move Inventory:</strong> Boosts Overstocked (100%) and Slow-Moving (100%) items to clear warehouse space.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Bestsellers:</strong> Inverse of Slow-Moving - promotes products with HIGH sales history.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>High Margin:</strong> Sets Profit Margin Boost to 100%, maximizing revenue per recommendation.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Seasonal:</strong> Focuses on Sale Items (100%) for promotions and clearance events.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Banner tone="info">
              <Text as="p" variant="bodyMd">
                <strong>Note:</strong> Changes take effect immediately for new customer recommendations. Run a product refresh to update inventory and sales data.
              </Text>
            </Banner>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Current Strategy
              </Text>
              <Divider />
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {STRATEGY_OPTIONS.find(opt => opt.value === formData.strategy)?.label}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {getStrategyDescription(formData.strategy)}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Active Boost Factors
              </Text>
              <Divider />
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    New Arrivals:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.newArrivalBoost}%
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Overstocked:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.lowInventoryBoost}%
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Slow-Moving:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.lowSalesBoost}%
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    High Margin:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.highMarginBoost}%
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    On Sale:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.onSaleBoost}%
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
