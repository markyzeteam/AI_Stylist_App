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
  Select,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  loadClaudeSettings,
  saveClaudeSettings,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_RECOMMENDATION_PROMPT,
  type ClaudePromptSettings
} from "../utils/claudeRecommendations";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Load Claude settings from database
  const settings = await loadClaudeSettings(shop);

  return json({ settings, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();

  // Handle reset to defaults
  if (formData.get("action") === "reset") {
    const defaultSettings: ClaudePromptSettings = {
      apiKey: undefined,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      recommendationPrompt: DEFAULT_RECOMMENDATION_PROMPT,
      enabled: true,
      temperature: 0.7,
      maxTokens: 4096,
    };

    const success = await saveClaudeSettings(shop, defaultSettings);

    if (success) {
      return json({
        success: true,
        settings: defaultSettings,
        message: "Settings reset to defaults successfully!"
      });
    } else {
      return json({
        success: false,
        settings: defaultSettings,
        message: "Failed to reset settings. Please try again."
      }, { status: 500 });
    }
  }

  // Regular save
  const settings: ClaudePromptSettings = {
    apiKey: (formData.get("apiKey") as string) || undefined,
    systemPrompt: (formData.get("systemPrompt") as string) || DEFAULT_SYSTEM_PROMPT,
    recommendationPrompt: (formData.get("recommendationPrompt") as string) || DEFAULT_RECOMMENDATION_PROMPT,
    enabled: formData.get("enabled") === "true",
    temperature: parseFloat(formData.get("temperature") as string) || 0.7,
    maxTokens: parseInt(formData.get("maxTokens") as string) || 4096,
  };

  // Save settings to database
  const success = await saveClaudeSettings(shop, settings);

  if (success) {
    return json({
      success: true,
      settings,
      message: "Claude AI settings saved successfully!"
    });
  } else {
    return json({
      success: false,
      settings,
      message: "Failed to save settings. Please try again."
    }, { status: 500 });
  }
};

export default function ClaudeSettings() {
  const { settings: loadedSettings, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [formData, setFormData] = useState(loadedSettings);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, { method: "post" });
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all prompts to defaults? This cannot be undone.")) {
      const formData = new FormData();
      formData.append("action", "reset");
      submit(formData, { method: "post" });
    }
  };

  const temperatureOptions = [
    { label: "0.0 (Deterministic)", value: "0" },
    { label: "0.3 (Focused)", value: "0.3" },
    { label: "0.5 (Balanced)", value: "0.5" },
    { label: "0.7 (Creative - Recommended)", value: "0.7" },
    { label: "1.0 (Very Creative)", value: "1" },
  ];

  return (
    <Page>
      <TitleBar title="Claude AI Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData?.success && (
              <Banner tone="success" onDismiss={() => {}}>
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
                  Claude AI Configuration
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure Claude AI to generate personalized product recommendations based on body shape analysis
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <Checkbox
                      label="Enable Claude AI Recommendations"
                      checked={formData.enabled}
                      onChange={(value) => setFormData({ ...formData, enabled: value })}
                      helpText="When enabled, Claude AI will generate recommendations. When disabled, the app will use the basic algorithm."
                    />
                    <input type="hidden" name="enabled" value={formData.enabled.toString()} />

                    <TextField
                      label="Anthropic API Key"
                      type={showApiKey ? "text" : "password"}
                      name="apiKey"
                      value={formData.apiKey || ""}
                      onChange={(value) => setFormData({ ...formData, apiKey: value })}
                      helpText="Your Anthropic API key. Leave empty to use the environment variable ANTHROPIC_API_KEY."
                      autoComplete="off"
                      connectedRight={
                        <Button onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? "Hide" : "Show"}
                        </Button>
                      }
                    />

                    <Select
                      label="Temperature"
                      options={temperatureOptions}
                      value={formData.temperature.toString()}
                      onChange={(value) => setFormData({ ...formData, temperature: parseFloat(value) })}
                      helpText="Controls randomness. Lower = more focused, Higher = more creative"
                    />
                    <input type="hidden" name="temperature" value={formData.temperature} />

                    <TextField
                      label="Max Tokens"
                      type="number"
                      name="maxTokens"
                      value={formData.maxTokens.toString()}
                      onChange={(value) => setFormData({ ...formData, maxTokens: parseInt(value) || 4096 })}
                      helpText="Maximum tokens in Claude's response (1000-16000, recommended: 8000)"
                      autoComplete="off"
                      min={1000}
                      max={16000}
                    />

                    <Divider />

                    <Text as="h3" variant="headingMd">
                      System Prompt
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      This is the core instruction that defines Claude's role as a fashion stylist
                    </Text>

                    <TextField
                      label=""
                      name="systemPrompt"
                      value={formData.systemPrompt}
                      onChange={(value) => setFormData({ ...formData, systemPrompt: value })}
                      multiline={10}
                      autoComplete="off"
                    />

                    <Divider />

                    <Text as="h3" variant="headingMd">
                      Recommendation Prompt
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      This prompt guides how Claude analyzes products and generates recommendations
                    </Text>

                    <TextField
                      label=""
                      name="recommendationPrompt"
                      value={formData.recommendationPrompt}
                      onChange={(value) => setFormData({ ...formData, recommendationPrompt: value })}
                      multiline={10}
                      autoComplete="off"
                    />

                    <InlineStack align="space-between">
                      <Button onClick={handleReset}>
                        Reset to Defaults
                      </Button>
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
                    • <strong>Claude AI:</strong> When enabled, uses Anthropic's Claude AI to intelligently analyze products and generate personalized recommendations
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>System Prompt:</strong> Defines Claude's role and expertise as a fashion stylist
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Recommendation Prompt:</strong> Instructions for how Claude should analyze products and create recommendations
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Temperature:</strong> Controls creativity vs. consistency. 0.7 is recommended for fashion recommendations
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Fallback:</strong> If Claude is disabled or encounters an error, the app automatically falls back to the algorithmic recommendation system
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Banner tone="info">
              <Text as="p" variant="bodyMd">
                <strong>API Key Priority:</strong> If you enter an API key here, it will be used instead of the environment variable. This allows you to use different keys for different shops.
              </Text>
            </Banner>

            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                <strong>Note:</strong> API keys are stored securely in your database. Make sure your database connection is secure and never share your API keys.
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
                    Status:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.enabled ? "✓ Enabled" : "✗ Disabled"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    API Key:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.apiKey ? "Custom" : "Environment"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Temperature:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.temperature}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Max Tokens:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {formData.maxTokens}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Get Your API Key
              </Text>
              <Text as="p" variant="bodyMd">
                To use Claude AI, you need an Anthropic API key. Visit this URL in a new browser tab:
              </Text>
              <TextField
                label="Anthropic Console URL"
                value="https://console.anthropic.com/"
                readOnly
                autoComplete="off"
                helpText="Copy this URL and open it in a new browser tab to get your API key"
              />
              <Text as="p" variant="bodyMd" tone="subdued">
                Note: Due to Shopify's security restrictions, external links cannot open directly from this admin page. Please copy the URL above and paste it into your browser.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
