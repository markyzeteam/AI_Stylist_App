import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useSearchParams } from "@remix-run/react";
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
  Select,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { loadGeminiSettings, saveGeminiSettings } from "../utils/geminiAnalysis";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Load Gemini settings from database
  const settings = await loadGeminiSettings(shop);

  // Check if user wants to view the full key (via query param)
  const url = new URL(request.url);
  const showKey = url.searchParams.get("showKey") === "true";

  return json({
    settings: {
      apiKey: showKey && settings.apiKey ? settings.apiKey : (settings.apiKey ? "••••••••••••••••" : ""),
      hasApiKey: !!settings.apiKey,
      model: settings.model,
      enabled: settings.enabled,
      prompt: settings.prompt,
      systemPrompt: settings.systemPrompt,
      requestsPerMinute: settings.requestsPerMinute || 15,
      requestsPerDay: settings.requestsPerDay || 1500,
      batchSize: settings.batchSize || 10,
      enableRateLimiting: settings.enableRateLimiting ?? true,
      useImageAnalysis: settings.useImageAnalysis ?? true,
      budgetLowMax: settings.budgetLowMax || 30,
      budgetMediumMax: settings.budgetMediumMax || 80,
      budgetHighMax: settings.budgetHighMax || 200,
    }
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  // Load existing settings
  const existingSettings = await loadGeminiSettings(shop);

  // Handle reset to defaults
  if (actionType === "resetPrompts") {
    const { DEFAULT_GEMINI_IMAGE_PROMPT, DEFAULT_GEMINI_SYSTEM_PROMPT } = await import("../utils/geminiAnalysis");
    const { db } = await import("../db.server");

    await db.geminiSettings.update({
      where: { shop },
      data: {
        prompt: DEFAULT_GEMINI_IMAGE_PROMPT,
        systemPrompt: DEFAULT_GEMINI_SYSTEM_PROMPT,
      },
    });

    return json({
      success: true,
      message: "Prompts reset to defaults successfully!"
    });
  }

  // Handle normal settings save
  const apiKey = formData.get("apiKey") as string;
  const model = (formData.get("model") as string) || existingSettings.model || "gemini-2.0-flash-exp";
  const enabled = formData.get("enabled") === "true";
  const prompt = formData.get("prompt") as string;
  const systemPrompt = formData.get("systemPrompt") as string;
  const requestsPerMinute = parseInt(formData.get("requestsPerMinute") as string) || 15;
  const requestsPerDay = parseInt(formData.get("requestsPerDay") as string) || 1500;
  const batchSize = parseInt(formData.get("batchSize") as string) || 10;
  const enableRateLimiting = formData.get("enableRateLimiting") === "true";
  const useImageAnalysis = formData.get("useImageAnalysis") === "true";
  const budgetLowMax = parseFloat(formData.get("budgetLowMax") as string) || 30;
  const budgetMediumMax = parseFloat(formData.get("budgetMediumMax") as string) || 80;
  const budgetHighMax = parseFloat(formData.get("budgetHighMax") as string) || 200;

  // If API key field is masked (••••••••), keep the existing key
  const finalApiKey = apiKey && apiKey.startsWith("••••") ? existingSettings.apiKey : apiKey;

  // Save settings
  const success = await saveGeminiSettings(shop, {
    apiKey: finalApiKey,
    model,
    enabled,
    prompt: prompt || existingSettings.prompt,
    systemPrompt: systemPrompt || existingSettings.systemPrompt,
    requestsPerMinute,
    requestsPerDay,
    batchSize,
    enableRateLimiting,
    useImageAnalysis,
    budgetLowMax,
    budgetMediumMax,
    budgetHighMax,
  });

  if (success) {
    return json({
      success: true,
      message: "Gemini settings saved successfully!"
    });
  } else {
    return json({
      success: false,
      message: "Failed to save settings. Please try again."
    }, { status: 500 });
  }
};

export default function GeminiSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [prompt, setPrompt] = useState(settings.prompt || "");
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt || "");
  const [apiTier, setApiTier] = useState("custom");
  const [requestsPerMinute, setRequestsPerMinute] = useState(String(settings.requestsPerMinute));
  const [requestsPerDay, setRequestsPerDay] = useState(String(settings.requestsPerDay));
  const [batchSize, setBatchSize] = useState(String(settings.batchSize));
  const [enableRateLimiting, setEnableRateLimiting] = useState(settings.enableRateLimiting);
  const [useImageAnalysis, setUseImageAnalysis] = useState(settings.useImageAnalysis);
  const [budgetLowMax, setBudgetLowMax] = useState(String(settings.budgetLowMax));
  const [budgetMediumMax, setBudgetMediumMax] = useState(String(settings.budgetMediumMax));
  const [budgetHighMax, setBudgetHighMax] = useState(String(settings.budgetHighMax));

  const isKeyVisible = searchParams.get("showKey") === "true";

  // Update state when loader data changes
  useEffect(() => {
    setApiKey(settings.apiKey);
    setPrompt(settings.prompt || "");
    setSystemPrompt(settings.systemPrompt || "");
    setRequestsPerMinute(String(settings.requestsPerMinute));
    setRequestsPerDay(String(settings.requestsPerDay));
    setBatchSize(String(settings.batchSize));
    setEnableRateLimiting(settings.enableRateLimiting);
    setBudgetLowMax(String(settings.budgetLowMax));
    setBudgetMediumMax(String(settings.budgetMediumMax));
    setBudgetHighMax(String(settings.budgetHighMax));
    setUseImageAnalysis(settings.useImageAnalysis);
  }, [settings.apiKey, settings.prompt, settings.systemPrompt, settings.requestsPerMinute, settings.requestsPerDay, settings.batchSize, settings.enableRateLimiting, settings.useImageAnalysis]);

  // Handle API tier selection
  const handleApiTierChange = (value: string) => {
    setApiTier(value);
    if (value === "free") {
      setRequestsPerMinute("15");
      setRequestsPerDay("1500");
      setEnableRateLimiting(true);
    } else if (value === "paid") {
      setRequestsPerMinute("2000");
      setRequestsPerDay("50000");
      setEnableRateLimiting(true);
    } else if (value === "unlimited") {
      setRequestsPerMinute("10000");
      setRequestsPerDay("1000000");
      setEnableRateLimiting(false);
    }
    // "custom" doesn't change values
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, { method: "post" });
  };

  const handleResetPrompts = () => {
    if (confirm("Reset prompts to default values? This will overwrite your current custom prompts.")) {
      const formData = new FormData();
      formData.append("actionType", "resetPrompts");
      submit(formData, { method: "post" });
    }
  };

  const handleToggleApiKey = () => {
    if (!isKeyVisible && settings.hasApiKey) {
      // Show the key by adding query parameter
      setSearchParams({ showKey: "true" });
    } else {
      // Hide the key by removing query parameter
      setSearchParams({});
    }
  };

  const modelOptions = [
    { label: "Gemini 2.0 Flash (Experimental) - Recommended", value: "gemini-2.0-flash-exp" },
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
  ];

  return (
    <Page>
      <TitleBar title="Gemini AI Settings" />
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
                  🎉 New Gemini-Only Architecture
                </Text>
                <Text as="p" variant="bodyMd">
                  We've upgraded to use Google Gemini 2.0 Flash for both image analysis and product recommendations. This is <strong>96% cheaper</strong> than the previous system and uses a single AI provider.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Cost:</strong> ~$18.83/month for 2,000 products + 100 users/day (vs $900/month with Claude)
                </Text>
              </BlockStack>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Gemini API Configuration
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure your Google Gemini API key and model settings
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <TextField
                        label="Gemini API Key"
                        type={apiKey.startsWith("••••") ? "password" : "text"}
                        name="apiKey"
                        value={apiKey}
                        onChange={setApiKey}
                        helpText={
                          settings.hasApiKey
                            ? "API key is configured. Leave as-is to keep existing key, or enter a new one to replace it."
                            : "Get your API key from Google AI Studio: https://ai.google.dev/"
                        }
                        autoComplete="off"
                        placeholder={settings.hasApiKey ? "••••••••••••••••" : "Enter your Gemini API key"}
                      />
                      {settings.hasApiKey && (
                        <InlineStack align="start">
                          <Button onClick={handleToggleApiKey} size="slim">
                            {isKeyVisible ? "🔒 Hide API Key" : "👁️ View API Key"}
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>

                    <Select
                      label="Gemini Model"
                      options={modelOptions}
                      value={model}
                      onChange={setModel}
                      helpText="Gemini 2.0 Flash is recommended for the best balance of speed, quality, and cost"
                    />
                    <input type="hidden" name="model" value={model} />

                    <Checkbox
                      label="Enable Gemini AI"
                      checked={enabled}
                      onChange={setEnabled}
                      helpText="When disabled, the system will use a basic algorithmic fallback (not recommended)"
                    />
                    <input type="hidden" name="enabled" value={enabled.toString()} />

                    <Divider />

                    <Checkbox
                      label="Use AI Image Analysis"
                      checked={useImageAnalysis}
                      onChange={setUseImageAnalysis}
                      helpText="When enabled, uses Gemini to analyze product images (colors, style, silhouette). When disabled, uses basic product data only (faster, no AI cost)"
                    />
                    <input type="hidden" name="useImageAnalysis" value={useImageAnalysis.toString()} />

                    <Banner tone={useImageAnalysis ? "info" : "warning"}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {useImageAnalysis ? "🎨 AI Image Analysis: ON" : "⚡ Basic Mode: ON (No Image Analysis)"}
                        </Text>
                        <Text as="p" variant="bodySm">
                          {useImageAnalysis
                            ? "Products will be analyzed with Gemini AI for visual features (colors, patterns, style). Best for personalized recommendations."
                            : "Products will be stored without image analysis. Faster refresh, no API costs, but recommendations will be based only on product data (title, description, tags)."}
                        </Text>
                      </BlockStack>
                    </Banner>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  💰 Budget Range Settings
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Define price ranges for customer budget preferences. These ranges will be used to filter products when customers select their budget in the shopping preferences questionnaire.
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <TextField
                      label='Budget "Low" Maximum Price'
                      type="number"
                      value={budgetLowMax}
                      onChange={setBudgetLowMax}
                      helpText={`Products under $${budgetLowMax} will be shown to budget-conscious customers`}
                      prefix="$"
                      min="1"
                      step="1"
                      autoComplete="off"
                    />
                    <input type="hidden" name="budgetLowMax" value={budgetLowMax} />

                    <TextField
                      label='Budget "Medium" Maximum Price'
                      type="number"
                      value={budgetMediumMax}
                      onChange={setBudgetMediumMax}
                      helpText={`Mid-range: $${budgetLowMax} - $${budgetMediumMax}`}
                      prefix="$"
                      min="1"
                      step="1"
                      autoComplete="off"
                    />
                    <input type="hidden" name="budgetMediumMax" value={budgetMediumMax} />

                    <TextField
                      label='Budget "High" Maximum Price'
                      type="number"
                      value={budgetHighMax}
                      onChange={setBudgetHighMax}
                      helpText={`Premium range: $${budgetMediumMax} - $${budgetHighMax}. Luxury is $${budgetHighMax}+`}
                      prefix="$"
                      min="1"
                      step="1"
                      autoComplete="off"
                    />
                    <input type="hidden" name="budgetHighMax" value={budgetHighMax} />

                    <Banner tone="info">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Current Budget Ranges:
                        </Text>
                        <Text as="p" variant="bodySm">
                          • Low: Under ${budgetLowMax}<br />
                          • Medium: ${budgetLowMax} - ${budgetMediumMax}<br />
                          • High: ${budgetMediumMax} - ${budgetHighMax}<br />
                          • Luxury: ${budgetHighMax}+
                        </Text>
                      </BlockStack>
                    </Banner>

                    <input type="hidden" name="actionType" value="save" />
                    <input type="hidden" name="model" value={model} />
                    <input type="hidden" name="enabled" value={enabled.toString()} />
                    <input type="hidden" name="useImageAnalysis" value={useImageAnalysis.toString()} />
                    <input type="hidden" name="enableRateLimiting" value={enableRateLimiting.toString()} />
                    <input type="hidden" name="requestsPerMinute" value={requestsPerMinute} />
                    <input type="hidden" name="requestsPerDay" value={requestsPerDay} />
                    <input type="hidden" name="batchSize" value={batchSize} />

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
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Rate Limiting Settings
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure API rate limits based on your Gemini API tier to prevent errors and optimize costs
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <Select
                      label="API Tier Preset"
                      options={[
                        { label: "Free Tier (15 RPM, 1,500 RPD)", value: "free" },
                        { label: "Paid Tier (2,000 RPM, 50,000 RPD)", value: "paid" },
                        { label: "Enterprise/Unlimited", value: "unlimited" },
                        { label: "Custom (Manual Entry)", value: "custom" },
                      ]}
                      value={apiTier}
                      onChange={handleApiTierChange}
                      helpText="Select your API tier to auto-fill rate limits, or choose Custom to set your own"
                    />

                    <Banner tone="info">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm">
                          <strong>Free Tier:</strong> 15 requests/minute, 1,500/day - Perfect for testing and small stores (up to ~1,500 products/day)
                        </Text>
                        <Text as="p" variant="bodySm">
                          <strong>Paid Tier:</strong> 2,000 requests/minute, 50,000/day - For medium to large stores
                        </Text>
                        <Text as="p" variant="bodySm">
                          <strong>Enterprise:</strong> Unlimited - For very large stores or custom API plans
                        </Text>
                      </BlockStack>
                    </Banner>

                    <TextField
                      label="Requests Per Minute (RPM)"
                      type="number"
                      name="requestsPerMinute"
                      value={requestsPerMinute}
                      onChange={setRequestsPerMinute}
                      helpText="Maximum API requests per minute (Gemini free tier: 15 RPM)"
                      min="1"
                    />

                    <TextField
                      label="Requests Per Day (RPD)"
                      type="number"
                      name="requestsPerDay"
                      value={requestsPerDay}
                      onChange={setRequestsPerDay}
                      helpText="Maximum API requests per day (Gemini free tier: 1,500 RPD)"
                      min="1"
                    />

                    <TextField
                      label="Batch Size"
                      type="number"
                      name="batchSize"
                      value={batchSize}
                      onChange={setBatchSize}
                      helpText="Number of products to process before checking rate limits (recommended: 10)"
                      min="1"
                      max="100"
                    />

                    <Checkbox
                      label="Enable Rate Limiting"
                      checked={enableRateLimiting}
                      onChange={setEnableRateLimiting}
                      helpText="Disable only if you have unlimited API access or want to handle rate limiting externally"
                    />
                    <input type="hidden" name="enableRateLimiting" value={enableRateLimiting.toString()} />

                    <Banner tone="warning">
                      <Text as="p" variant="bodySm">
                        <strong>Note:</strong> The system will automatically pause when approaching rate limits. If you hit the daily limit, the refresh will resume the next day at midnight PT (Gemini's reset time).
                      </Text>
                    </Banner>

                    <input type="hidden" name="apiKey" value={apiKey} />
                    <input type="hidden" name="model" value={model} />
                    <input type="hidden" name="enabled" value={enabled.toString()} />
                    <input type="hidden" name="prompt" value={prompt} />
                    <input type="hidden" name="systemPrompt" value={systemPrompt} />
                    <input type="hidden" name="actionType" value="save" />

                    <InlineStack align="end">
                      <Button variant="primary" submit>
                        Save Rate Limit Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Advanced: Custom Prompts
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Customize the prompts used by Gemini AI for image analysis and recommendations
                </Text>

                <Divider />

                <form onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Phase 1: Image Analysis Prompt
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        This prompt is used when analyzing product images to extract visual features (colors, style, silhouette, etc.)
                      </Text>
                      <Banner tone="info">
                        <Text as="p" variant="bodySm">
                          <strong>Note:</strong> You can customize the analysis instructions, but the JSON format structure is fixed and automatically enforced to ensure data consistency. The response will always include: detectedColors, colorSeasons, silhouetteType, styleClassification, fabricTexture, designDetails, patternType, and additionalNotes.
                        </Text>
                      </Banner>
                      <TextField
                        label="Image Analysis Prompt (Customizable)"
                        name="prompt"
                        value={prompt}
                        onChange={setPrompt}
                        multiline={8}
                        autoComplete="off"
                        helpText="Customize what you want Gemini to focus on when analyzing images. The JSON format will be automatically enforced."
                      />
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Phase 2: Recommendation System Prompt
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        This system prompt guides Gemini when generating personalized product recommendations
                      </Text>
                      <TextField
                        label="System Prompt"
                        name="systemPrompt"
                        value={systemPrompt}
                        onChange={setSystemPrompt}
                        multiline={6}
                        autoComplete="off"
                        helpText="Define Gemini's role and expertise for product recommendations."
                      />
                    </BlockStack>

                    <input type="hidden" name="apiKey" value={apiKey} />
                    <input type="hidden" name="model" value={model} />
                    <input type="hidden" name="enabled" value={enabled.toString()} />
                    <input type="hidden" name="actionType" value="save" />

                    <Divider />

                    <InlineStack align="space-between">
                      <Button onClick={handleResetPrompts} tone="critical">
                        Reset to Defaults
                      </Button>
                      <Button variant="primary" submit>
                        Save Custom Prompts
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  How to Get Your Gemini API Key
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    1. Go to <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3" }}>Google AI Studio</a>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Sign in with your Google account
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Click "Get API Key" in the top right
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Create a new API key or use an existing one
                  </Text>
                  <Text as="p" variant="bodyMd">
                    5. Copy the API key and paste it above
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Gemini Pricing (2025)
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Gemini 2.0 Flash:</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Input: $0.10 per 1M tokens
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Output: $0.40 per 1M tokens
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Images: 258 tokens per image (fixed)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Free Tier:</strong> 1M tokens/day (perfect for testing!)
                  </Text>
                </BlockStack>
                <Divider />
                <Text as="p" variant="bodyMd" tone="subdued">
                  Example: A medium store with 2,000 products and 100 users/day costs approximately <strong>$18.83/month</strong>
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Two-Phase Architecture
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Phase 1: Admin Refresh (3x/day)</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Fetches products from Shopify
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Analyzes images with Gemini (colors, silhouette, style)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Caches results in database
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Only analyzes NEW or UPDATED products (saves costs)
                  </Text>
                  <Divider />
                  <Text as="p" variant="bodyMd">
                    <strong>Phase 2: User Recommendations (Real-time)</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Uses cached analysis from Phase 1
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • NO images sent (text-only, very fast)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Gemini recommends products based on body shape + color season
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Returns personalized styling tips
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Current Status
              </Text>
              <Divider />
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    API Key:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {settings.hasApiKey ? "✅ Configured" : "❌ Not Set"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Model:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {model}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd" tone="subdued">
                    Status:
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    {enabled ? "✅ Enabled" : "❌ Disabled"}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          {!settings.hasApiKey && (
            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                <strong>Action Required:</strong> Please configure your Gemini API key to enable AI-powered recommendations.
              </Text>
            </Banner>
          )}

          {settings.hasApiKey && enabled && (
            <Banner tone="success">
              <Text as="p" variant="bodyMd">
                Gemini AI is active and ready to provide personalized recommendations!
              </Text>
            </Banner>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
