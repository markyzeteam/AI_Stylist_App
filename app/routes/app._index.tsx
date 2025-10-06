import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  TextField,
  Select,
  Divider,
  Banner,
  List,
  Box,
  Thumbnail,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { calculateBodyShape, type BodyShapeResult } from "../utils/bodyShape";
import { getProductRecommendations, type ProductRecommendation } from "../utils/productRecommendations";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const bodyShape = formData.get("bodyShape") as string;
  const useAI = formData.get("useAI") === "true";

  // Get measurements if available for AI
  const measurements = {
    gender: formData.get("gender") as string,
    age: formData.get("age") as string,
    bust: parseFloat(formData.get("bust") as string || "0"),
    waist: parseFloat(formData.get("waist") as string || "0"),
    hips: parseFloat(formData.get("hips") as string || "0"),
    shoulders: parseFloat(formData.get("shoulders") as string || "0")
  };

  if (!bodyShape) {
    return { error: "Body shape is required" };
  }

  try {
    // Scan ALL in-stock products and recommend based on body shape
    const recommendations = await getProductRecommendations(
      admin,
      bodyShape,
      30  // Return top 30 recommendations
    );
    return { recommendations };
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return { error: "Failed to fetch product recommendations" };
  }
};

type UserPath = 'select' | 'calculator' | 'known-shape' | 'results';

interface Measurements {
  gender: string;
  age: string;
  height: string;
  weight: string;
  bust: string;
  waist: string;
  hips: string;
  shoulders: string;
  unit: 'metric' | 'imperial';
}

export default function Index() {
  const [currentPath, setCurrentPath] = useState<UserPath>('select');
  const [measurements, setMeasurements] = useState<Measurements>({
    gender: '',
    age: '',
    height: '',
    weight: '',
    bust: '',
    waist: '',
    hips: '',
    shoulders: '',
    unit: 'metric'
  });
  const [bodyShapeResult, setBodyShapeResult] = useState<BodyShapeResult | null>(null);
  const productFetcher = useFetcher<{ recommendations: ProductRecommendation[]; error?: string }>();

  const updateMeasurement = (field: keyof Measurements, value: string) => {
    setMeasurements(prev => ({ ...prev, [field]: value }));
  };

  const handleCalculateBodyShape = () => {
    const bodyMeasurements = {
      gender: measurements.gender,
      age: measurements.age,
      height: parseFloat(measurements.height),
      weight: parseFloat(measurements.weight),
      bust: parseFloat(measurements.bust),
      waist: parseFloat(measurements.waist),
      hips: parseFloat(measurements.hips),
      shoulders: parseFloat(measurements.shoulders),
      unit: measurements.unit
    };

    const result = calculateBodyShape(bodyMeasurements);
    setBodyShapeResult(result);
    setCurrentPath('results');
  };

  const renderPathSelection = () => (
    <Card>
      <BlockStack gap="500">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Find Your Perfect Fit 👗
          </Text>
          <Text variant="bodyMd" as="p">
            Get personalized clothing recommendations based on your body shape.
            Choose how you'd like to proceed:
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Button
            size="large"
            onClick={() => setCurrentPath('calculator')}
            fullWidth
          >
            📏 Calculate My Body Shape
          </Button>
          <Text variant="bodySm" as="span" tone="subdued" alignment="center">
            Take measurements to determine your body shape
          </Text>

          <Button
            size="large"
            variant="secondary"
            onClick={() => setCurrentPath('known-shape')}
            fullWidth
          >
            ✨ I Know My Body Shape
          </Button>
          <Text variant="bodySm" as="span" tone="subdued" alignment="center">
            Skip to product recommendations
          </Text>
        </BlockStack>
      </BlockStack>
    </Card>
  );

  const renderCalculator = () => {
    const genderOptions = [
      { label: 'Select Gender', value: '' },
      { label: 'Woman', value: 'woman' },
      { label: 'Man', value: 'man' },
      { label: 'Non-binary', value: 'non-binary' },
    ];

    const ageOptions = [
      { label: 'Select Age Range', value: '' },
      { label: '13-17', value: '13-17' },
      { label: '18-25', value: '18-25' },
      { label: '26-35', value: '26-35' },
      { label: '36-45', value: '36-45' },
      { label: '46-55', value: '46-55' },
      { label: '56+', value: '56+' },
    ];

    const unitOptions = [
      { label: 'Metric (cm/kg)', value: 'metric' },
      { label: 'Imperial (in/lbs)', value: 'imperial' },
    ];

    const isFormValid = measurements.gender && measurements.age &&
                       measurements.height && measurements.waist &&
                       measurements.hips && measurements.bust;

    return (
      <Card>
        <BlockStack gap="500">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              Body Shape Calculator
            </Text>
            <Button variant="tertiary" onClick={() => setCurrentPath('select')}>
              ← Back
            </Button>
          </InlineStack>

          <Banner tone="info">
            <Text variant="bodyMd" as="p">
              Please provide your measurements for accurate body shape calculation and personalized recommendations.
            </Text>
          </Banner>

          <BlockStack gap="400">
            {/* Basic Info */}
            <Text as="h3" variant="headingMd">
              Basic Information
            </Text>

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <Select
                  label="Gender"
                  options={genderOptions}
                  value={measurements.gender}
                  onChange={(value) => updateMeasurement('gender', value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Age Range"
                  options={ageOptions}
                  value={measurements.age}
                  onChange={(value) => updateMeasurement('age', value)}
                />
              </div>
            </InlineStack>

            <Select
              label="Measurement Unit"
              options={unitOptions}
              value={measurements.unit}
              onChange={(value) => updateMeasurement('unit', value as 'metric' | 'imperial')}
            />

            <Divider />

            {/* Body Measurements */}
            <Text as="h3" variant="headingMd">
              Body Measurements
            </Text>

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Height (${measurements.unit === 'metric' ? 'cm' : 'inches'})`}
                  value={measurements.height}
                  onChange={(value) => updateMeasurement('height', value)}
                  type="number"
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Weight (${measurements.unit === 'metric' ? 'kg' : 'lbs'})`}
                  value={measurements.weight}
                  onChange={(value) => updateMeasurement('weight', value)}
                  type="number"
                  autoComplete="off"
                />
              </div>
            </InlineStack>

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Bust/Chest (${measurements.unit === 'metric' ? 'cm' : 'inches'})`}
                  value={measurements.bust}
                  onChange={(value) => updateMeasurement('bust', value)}
                  type="number"
                  autoComplete="off"
                  helpText="Measure around the fullest part"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Waist (${measurements.unit === 'metric' ? 'cm' : 'inches'})`}
                  value={measurements.waist}
                  onChange={(value) => updateMeasurement('waist', value)}
                  type="number"
                  autoComplete="off"
                  helpText="Measure at the narrowest point"
                />
              </div>
            </InlineStack>

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Hips (${measurements.unit === 'metric' ? 'cm' : 'inches'})`}
                  value={measurements.hips}
                  onChange={(value) => updateMeasurement('hips', value)}
                  type="number"
                  autoComplete="off"
                  helpText="Measure around the fullest part"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={`Shoulders (${measurements.unit === 'metric' ? 'cm' : 'inches'})`}
                  value={measurements.shoulders}
                  onChange={(value) => updateMeasurement('shoulders', value)}
                  type="number"
                  autoComplete="off"
                  helpText="Measure across shoulder points"
                />
              </div>
            </InlineStack>

            <Divider />

            <InlineStack align="end">
              <Button
                primary
                onClick={handleCalculateBodyShape}
                disabled={!isFormValid}
              >
                Calculate My Body Shape
              </Button>
            </InlineStack>
          </BlockStack>
        </BlockStack>
      </Card>
    );
  };

  const renderKnownShape = () => {
    const bodyShapes = [
      {
        name: "Pear/Triangle",
        description: "Hips wider than bust and shoulders",
        characteristics: "Fuller hips and thighs, narrower shoulders",
        icon: "🍐"
      },
      {
        name: "Apple/Round",
        description: "Fuller midsection with less defined waist",
        characteristics: "Fuller bust and midsection, slimmer legs",
        icon: "🍎"
      },
      {
        name: "Hourglass",
        description: "Balanced bust and hips with defined waist",
        characteristics: "Curved silhouette, well-defined waist",
        icon: "⏳"
      },
      {
        name: "Inverted Triangle",
        description: "Broader shoulders and bust than hips",
        characteristics: "Broader shoulders, narrower hips",
        icon: "🔺"
      },
      {
        name: "Rectangle/Straight",
        description: "Similar measurements throughout",
        characteristics: "Balanced proportions, minimal waist definition",
        icon: "📱"
      },
      {
        name: "V-Shape/Athletic",
        description: "Broad shoulders with narrow waist",
        characteristics: "Athletic build, muscular shoulders",
        icon: "💪"
      }
    ];

    const handleShapeSelection = (shapeName: string) => {
      // Create a mock result for the selected shape
      const selectedShape = bodyShapes.find(shape => shape.name === shapeName);
      if (selectedShape) {
        const mockResult: BodyShapeResult = {
          shape: selectedShape.name,
          description: selectedShape.description,
          confidence: 1.0, // 100% confidence since user selected it
          characteristics: [selectedShape.characteristics],
          recommendations: getRecommendationsForShape(selectedShape.name)
        };
        setBodyShapeResult(mockResult);
        setCurrentPath('results');
      }
    };

    const getRecommendationsForShape = (shapeName: string): string[] => {
      const recommendations: Record<string, string[]> = {
        "Pear/Triangle": [
          "A-line and fit-and-flare dresses",
          "Wide-leg pants and bootcut jeans",
          "Tops with interesting necklines",
          "Structured blazers to balance shoulders"
        ],
        "Apple/Round": [
          "Empire waist dresses",
          "V-neck and scoop neck tops",
          "High-waisted bottoms",
          "Flowing fabrics that skim the body"
        ],
        "Hourglass": [
          "Fitted clothing that follows your curves",
          "Wrap dresses and tops",
          "High-waisted styles",
          "Belted garments to emphasize waist"
        ],
        "Inverted Triangle": [
          "A-line skirts and dresses",
          "Wide-leg pants",
          "Scoop and V-necklines",
          "Minimize shoulder details"
        ],
        "Rectangle/Straight": [
          "Create curves with belts and fitted styles",
          "Layering to add dimension",
          "Peplum tops and dresses",
          "Cropped jackets and structured pieces"
        ],
        "V-Shape/Athletic": [
          "Fitted shirts that show your shape",
          "Straight-leg pants",
          "Minimal shoulder padding",
          "V-necks and open collars"
        ]
      };
      return recommendations[shapeName] || [];
    };

    return (
      <Card>
        <BlockStack gap="500">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              Select Your Body Shape
            </Text>
            <Button variant="tertiary" onClick={() => setCurrentPath('select')}>
              ← Back
            </Button>
          </InlineStack>

          <Banner tone="info">
            <Text variant="bodyMd" as="p">
              Choose the body shape that best describes you to get personalized recommendations.
            </Text>
          </Banner>

          <BlockStack gap="400">
            {bodyShapes.map((shape, index) => (
              <Card key={index}>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingMd" as="p">{shape.icon}</Text>
                      <Text as="h3" variant="headingMd">
                        {shape.name}
                      </Text>
                    </InlineStack>
                    <Text variant="bodyMd" as="span" tone="subdued">
                      {shape.description}
                    </Text>
                    <Text variant="bodySm" as="span" tone="subdued">
                      {shape.characteristics}
                    </Text>
                  </BlockStack>
                  <Button
                    onClick={() => handleShapeSelection(shape.name)}
                    variant="primary"
                  >
                    Select This Shape
                  </Button>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>

          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                💡 Not Sure?
              </Text>
              <Text variant="bodyMd" as="p">
                If you're unsure about your body shape, use our calculator to get measurements-based results.
              </Text>
              <Button variant="secondary" onClick={() => setCurrentPath('calculator')}>
                Use Body Shape Calculator
              </Button>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>
    );
  };

  const renderResults = () => {
    if (!bodyShapeResult) return null;

    const loadProducts = () => {
      const formData = new FormData();
      formData.append("bodyShape", bodyShapeResult.shape);
      formData.append("useAI", "true");

      // Include measurements for AI analysis
      formData.append("gender", measurements.gender);
      formData.append("age", measurements.age);
      formData.append("bust", measurements.bust);
      formData.append("waist", measurements.waist);
      formData.append("hips", measurements.hips);
      formData.append("shoulders", measurements.shoulders);

      productFetcher.submit(formData, { method: "POST" });
    };

    const recommendations = productFetcher.data?.recommendations || [];
    const isLoadingProducts = productFetcher.state === "submitting";

    return (
      <Card>
        <BlockStack gap="500">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              Your Body Shape Results
            </Text>
            <Button variant="tertiary" onClick={() => setCurrentPath('select')}>
              ← Start Over
            </Button>
          </InlineStack>

          <Banner tone="success">
            <Text variant="bodyMd" as="p">
              Based on your measurements, here are your personalized results!
            </Text>
          </Banner>

          {/* Body Shape Result */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingLg">
                  {bodyShapeResult.shape}
                </Text>
                <Badge status="success">
                  {Math.round(bodyShapeResult.confidence * 100)}% confidence
                </Badge>
              </InlineStack>

              <Text variant="bodyMd" as="span" tone="subdued">
                {bodyShapeResult.description}
              </Text>
            </BlockStack>
          </Card>

          {/* Characteristics */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Your Body Characteristics
              </Text>
              <List>
                {bodyShapeResult.characteristics.map((characteristic, index) => (
                  <List.Item key={index}>{characteristic}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>

          {/* Style Recommendations */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Style Recommendations
              </Text>
              <List>
                {bodyShapeResult.recommendations.map((recommendation, index) => (
                  <List.Item key={index}>{recommendation}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>

          {/* Product Recommendations */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">
                  🛍️ Recommended Products
                </Text>
                {!recommendations.length && (
                  <Button
                    primary
                    onClick={loadProducts}
                    loading={isLoadingProducts}
                  >
                    Find Products For Me
                  </Button>
                )}
              </InlineStack>

              {productFetcher.data?.error && (
                <Banner tone="warning">
                  <Text variant="bodyMd" as="p">
                    {productFetcher.data.error}
                  </Text>
                </Banner>
              )}

              {isLoadingProducts && (
                <Box>
                  <Text variant="bodyMd" as="p">Finding the perfect products for your {bodyShapeResult.shape} body shape...</Text>
                </Box>
              )}

              {recommendations.length > 0 && (
                <BlockStack gap="300">
                  <Text variant="bodyMd" as="span" tone="subdued">
                    Found {recommendations.length} products perfect for your {bodyShapeResult.shape} body shape:
                  </Text>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {recommendations.map((rec, index) => (
                      <Card key={index}>
                        <BlockStack gap="300">
                          {rec.product.images.length > 0 && (
                            <Thumbnail
                              source={rec.product.images[0].url}
                              alt={rec.product.images[0].altText || rec.product.title}
                              size="large"
                            />
                          )}

                          <BlockStack gap="200">
                            <Text as="h4" variant="headingMd">
                              {rec.product.title}
                            </Text>

                            <Badge status={rec.suitabilityScore > 0.7 ? 'success' : 'attention'}>
                              {Math.round(rec.suitabilityScore * 100)}% match
                            </Badge>

                            {rec.product.variants.length > 0 && (
                              <Text variant="bodyMd" as="p">
                                From ${rec.product.variants[0].price}
                              </Text>
                            )}

                            <Text variant="bodySm" as="span" tone="subdued">
                              {rec.reasoning}
                            </Text>

                            {(rec as any).stylingTip && (
                              <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                                <Text variant="bodySm" as="p">
                                  💡 <strong>Styling tip:</strong> {(rec as any).stylingTip}
                                </Text>
                              </Box>
                            )}

                            <Text variant="bodySm" as="p">
                              <strong>Size advice:</strong> {rec.recommendedSize}
                            </Text>
                          </BlockStack>

                          <Button fullWidth variant="primary">
                            View Product
                          </Button>
                        </BlockStack>
                      </Card>
                    ))}
                  </div>
                </BlockStack>
              )}

              {recommendations.length === 0 && !isLoadingProducts && !productFetcher.data?.error && (
                <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p">
                      Click "Find Products For Me" to see personalized clothing recommendations
                      from your store based on your {bodyShapeResult.shape} body shape!
                    </Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      </Card>
    );
  };

  return (
    <Page>
      <TitleBar title="YZE Shopping AI - Body Shape Advisor" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {currentPath === 'select' && renderPathSelection()}
            {currentPath === 'calculator' && renderCalculator()}
            {currentPath === 'known-shape' && renderKnownShape()}
            {currentPath === 'results' && renderResults()}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  How It Works
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    • Get your body shape through measurements or selection
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Receive personalized clothing recommendations
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Get size suggestions for each product
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Add items directly to cart or wishlist
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}