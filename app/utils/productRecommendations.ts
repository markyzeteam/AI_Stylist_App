import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface Product {
  id: string;
  title: string;
  description: string;
  handle: string;
  images: {
    url: string;
    altText?: string;
  }[];
  variants: {
    id: string;
    title: string;
    price: string;
    compareAtPrice?: string;
    available: boolean;
    selectedOptions: {
      name: string;
      value: string;
    }[];
  }[];
  productType: string;
  tags: string[];
}

export interface ProductRecommendation {
  product: Product;
  suitabilityScore: number;
  recommendedSize?: string;
  reasoning: string;
  category: string;
  stylingTip?: string;
}

// Mapping body shapes to suitable clothing categories and styles
const BODY_SHAPE_PREFERENCES = {
  "Pear/Triangle": {
    favorable: ["tops", "blouses", "jackets", "blazers", "statement-sleeves"],
    neutral: ["dresses", "jumpsuits"],
    avoid: ["tight-bottoms", "skinny-jeans"],
    keywords: ["a-line", "fit-and-flare", "empire-waist", "bootcut", "wide-leg", "structured-shoulders"]
  },
  "Apple/Round": {
    favorable: ["dresses", "tunics", "flowing-tops", "v-necks"],
    neutral: ["jackets", "cardigans"],
    avoid: ["tight-waist", "crop-tops"],
    keywords: ["empire-waist", "v-neck", "scoop-neck", "high-waisted", "flowing", "wrap"]
  },
  "Hourglass": {
    favorable: ["fitted-dresses", "wrap-dresses", "belted-items", "high-waisted"],
    neutral: ["tops", "bottoms"],
    avoid: ["loose-fitting", "baggy"],
    keywords: ["fitted", "wrap", "belted", "high-waisted", "curve-hugging", "bodycon"]
  },
  "Inverted Triangle": {
    favorable: ["bottoms", "skirts", "wide-leg-pants", "a-line"],
    neutral: ["dresses"],
    avoid: ["shoulder-pads", "statement-sleeves"],
    keywords: ["a-line", "wide-leg", "bootcut", "scoop-neck", "v-neck", "minimize-shoulders"]
  },
  "Rectangle/Straight": {
    favorable: ["belted-items", "peplum", "layering", "structured"],
    neutral: ["tops", "bottoms", "dresses"],
    avoid: ["straight-cut", "loose-fitting"],
    keywords: ["belted", "peplum", "structured", "layered", "cropped", "fitted"]
  },
  "V-Shape/Athletic": {
    favorable: ["fitted-shirts", "straight-leg", "minimal-shoulder"],
    neutral: ["casual-wear", "athletic-wear"],
    avoid: ["shoulder-emphasis", "tight-fitting"],
    keywords: ["fitted", "straight-leg", "v-neck", "minimal", "athletic", "casual"]
  }
};

// Size recommendation logic based on body shape
const SIZE_RECOMMENDATIONS = {
  "Pear/Triangle": {
    tops: "Consider sizing up for comfortable fit across hips",
    bottoms: "Focus on hip measurement, may need larger size",
    dresses: "Choose based on largest measurement (usually hips)"
  },
  "Apple/Round": {
    tops: "Choose based on bust measurement, empire waist styles work well",
    bottoms: "High-waisted styles, size for waist comfort",
    dresses: "Empire waist or A-line, size for bust"
  },
  "Hourglass": {
    tops: "Size for bust, should nip in at waist",
    bottoms: "Size for hips, high-waisted styles recommended",
    dresses: "Size for largest measurement, fitted styles work best"
  },
  "Inverted Triangle": {
    tops: "Size for shoulders/bust, avoid tight fits",
    bottoms: "Can often size down, focus on hip fit",
    dresses: "Size for shoulders/bust, A-line styles recommended"
  },
  "Rectangle/Straight": {
    tops: "Standard sizing, add belts or structure",
    bottoms: "Standard sizing, can experiment with different cuts",
    dresses: "Standard sizing, belted styles create curves"
  },
  "V-Shape/Athletic": {
    tops: "Size for chest/shoulders, fitted cuts work well",
    bottoms: "Standard sizing, straight cuts recommended",
    dresses: "Size for chest, avoid shoulder emphasis"
  }
};

export async function fetchProducts(admin: AdminApiContext): Promise<Product[]> {
  const response = await admin.graphql(
    `#graphql
      query GetProducts($first: Int!) {
        products(first: $first) {
          nodes {
            id
            title
            description
            handle
            productType
            tags
            images(first: 5) {
              nodes {
                url
                altText
              }
            }
            variants(first: 10) {
              nodes {
                id
                title
                price
                compareAtPrice
                availableForSale
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        first: 1000 // Fetch up to 50 products
      }
    }
  );

  const responseJson = await response.json();
  const products = responseJson.data?.products?.nodes || [];

  return products.map((product: any) => ({
    id: product.id,
    title: product.title,
    description: product.description || '',
    handle: product.handle,
    images: product.images?.nodes?.map((img: any) => ({
      url: img.url,
      altText: img.altText
    })) || [],
    variants: product.variants?.nodes?.map((variant: any) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      available: variant.availableForSale,
      selectedOptions: variant.selectedOptions || []
    })) || [],
    productType: product.productType || '',
    tags: product.tags || []
  }));
}

export function calculateProductSuitability(product: Product, bodyShape: string): number {
  const preferences = BODY_SHAPE_PREFERENCES[bodyShape as keyof typeof BODY_SHAPE_PREFERENCES];
  if (!preferences) return 0.5; // neutral score if body shape not found

  let score = 0.5; // base score
  const productText = `${product.title} ${product.description} ${product.productType} ${product.tags.join(' ')}`.toLowerCase();

  // Check for favorable keywords
  preferences.keywords.forEach(keyword => {
    if (productText.includes(keyword.toLowerCase())) {
      score += 0.15;
    }
  });

  // Check product type/category alignment
  preferences.favorable.forEach(category => {
    if (productText.includes(category.toLowerCase())) {
      score += 0.2;
    }
  });

  preferences.neutral.forEach(category => {
    if (productText.includes(category.toLowerCase())) {
      score += 0.05;
    }
  });

  preferences.avoid.forEach(category => {
    if (productText.includes(category.toLowerCase())) {
      score -= 0.2;
    }
  });

  // Normalize score between 0 and 1
  return Math.max(0, Math.min(1, score));
}

export function getSizeRecommendation(product: Product, bodyShape: string): string {
  const category = determineProductCategory(product);
  const recommendations = SIZE_RECOMMENDATIONS[bodyShape as keyof typeof SIZE_RECOMMENDATIONS];

  if (!recommendations) {
    return "Choose your normal size and check the size chart";
  }

  return recommendations[category as keyof typeof recommendations] ||
         "Choose your normal size and check the size chart";
}

function determineProductCategory(product: Product): string {
  const productText = `${product.title} ${product.description} ${product.productType}`.toLowerCase();

  if (productText.includes('dress') || productText.includes('gown')) {
    return 'dresses';
  }
  if (productText.includes('top') || productText.includes('shirt') || productText.includes('blouse') || productText.includes('sweater')) {
    return 'tops';
  }
  if (productText.includes('pant') || productText.includes('jean') || productText.includes('trouser') || productText.includes('short')) {
    return 'bottoms';
  }

  return 'general';
}

export async function getProductRecommendations(
  admin: AdminApiContext,
  bodyShape: string,
  limit: number = 12
): Promise<ProductRecommendation[]> {
  try {
    const products = await fetchProducts(admin);

    console.log(`Scanning ${products.length} total products for ${bodyShape}`);

    // Filter to only in-stock products
    const inStockProducts = products.filter(product => {
      return product.variants && product.variants.some(v => v.available === true);
    });

    console.log(`Found ${inStockProducts.length} in-stock products`);

    const recommendations = inStockProducts
      .map(product => {
        const suitabilityScore = calculateProductSuitability(product, bodyShape);
        const category = determineProductCategory(product);
        const sizeRecommendation = getSizeRecommendation(product, bodyShape);

        return {
          product,
          suitabilityScore,
          recommendedSize: sizeRecommendation,
          reasoning: generateRecommendationReasoning(product, bodyShape, suitabilityScore),
          category
        };
      })
      .filter(rec => rec.suitabilityScore > 0.3) // Only show reasonably suitable items
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore) // Sort by suitability
      .slice(0, limit);

    console.log(`Returning top ${recommendations.length} recommendations`);

    return recommendations;
  } catch (error) {
    console.error('Error fetching product recommendations:', error);
    return [];
  }
}

function generateRecommendationReasoning(product: Product, bodyShape: string, score: number): string {
  const preferences = BODY_SHAPE_PREFERENCES[bodyShape as keyof typeof BODY_SHAPE_PREFERENCES];

  if (score > 0.7) {
    return `Excellent match for ${bodyShape} body shape - this style is highly recommended for your figure`;
  } else if (score > 0.5) {
    return `Good choice for ${bodyShape} body shape - this style complements your figure well`;
  } else {
    return `Suitable option for ${bodyShape} body shape - consider your personal style preferences`;
  }
}