/**
 * Product Recommendations using Shopify MCP Storefront
 *
 * This replaces the old Admin API product fetching with
 * the new Shopify Storefront MCP server
 */

import { fetchAllProducts, searchShopCatalog, type MCPProduct } from "./shopifyMCP";

export interface ProductRecommendation {
  product: MCPProduct;
  suitabilityScore: number;
  recommendedSize?: string;
  reasoning: string;
  category: string;
  stylingTip?: string;
}

// Body shape preferences and keywords
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

/**
 * Fetch products from MCP and calculate suitability
 */
export async function getProductRecommendationsFromMCP(
  storeDomain: string,
  bodyShape: string,
  limit: number = 12,
  onlyInStock: boolean = true
): Promise<ProductRecommendation[]> {
  try {
    console.log(`🛍️ Getting product recommendations for ${bodyShape} from MCP`);

    // Fetch all products from MCP
    const products = await fetchAllProducts(storeDomain, bodyShape);

    console.log(`✓ Fetched ${products.length} total products from MCP`);

    // STEP 1: Filter by stock availability
    const stockFilteredProducts = onlyInStock
      ? products.filter(product => product.available !== false)
      : products;

    console.log(`✓ Stock filter: ${products.length} → ${stockFilteredProducts.length} ${onlyInStock ? 'in-stock' : 'all'} products`);

    // STEP 2: Pre-filter by "avoid" keywords
    const preFilteredProducts = preFilterProducts(stockFilteredProducts, bodyShape);

    console.log(`✓ Pre-filter (avoid keywords): ${stockFilteredProducts.length} → ${preFilteredProducts.length} relevant products for ${bodyShape}`);

    // STEP 3: Calculate suitability scores
    const recommendations = preFilteredProducts
      .map(product => {
        const suitabilityScore = calculateProductSuitability(product, bodyShape);
        const category = determineProductCategory(product);

        return {
          product,
          suitabilityScore,
          recommendedSize: getSizeRecommendation(product, bodyShape),
          reasoning: generateRecommendationReasoning(product, bodyShape, suitabilityScore),
          category,
          stylingTip: ""
        };
      })
      .filter(rec => rec.suitabilityScore > 0.3) // Only show reasonably suitable items
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore) // Sort by suitability
      .slice(0, limit);

    console.log(`✓ Returning top ${recommendations.length} recommendations`);

    return recommendations;
  } catch (error) {
    console.error('❌ Error fetching MCP product recommendations:', error);
    return [];
  }
}

/**
 * Pre-filter products to remove unsuitable items
 */
export function preFilterProducts(products: MCPProduct[], bodyShape: string): MCPProduct[] {
  const avoidKeywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["tight-fit-bottom", "skinny-jean", "pencil-skirt"],
    "Apple/Round": ["tight-waist", "crop-top", "bodycon"],
    "Hourglass": ["oversized", "baggy", "shapeless"],
    "Inverted Triangle": ["shoulder-pad", "puff-sleeve", "statement-shoulder"],
    "Rectangle/Straight": ["straight-cut", "shift-dress"],
    "V-Shape/Athletic": ["heavily-structured-shoulder"],
  };

  const avoid = avoidKeywords[bodyShape] || [];

  return products.filter(product => {
    const productText = `${product.name} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

    // Remove products with avoid keywords
    const hasAvoidKeyword = avoid.some(keyword => productText.includes(keyword.toLowerCase()));
    if (hasAvoidKeyword) return false;

    return true;
  });
}

/**
 * Calculate suitability score for a product
 */
export function calculateProductSuitability(product: MCPProduct, bodyShape: string): number {
  const preferences = BODY_SHAPE_PREFERENCES[bodyShape as keyof typeof BODY_SHAPE_PREFERENCES];
  if (!preferences) return 0.5;

  let score = 0.5; // base score
  const productText = `${product.name} ${product.description} ${product.productType} ${(product.tags || []).join(' ')}`.toLowerCase();

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

/**
 * Determine product category
 */
function determineProductCategory(product: MCPProduct): string {
  const text = `${product.name} ${product.description} ${product.productType}`.toLowerCase();

  if (text.includes("dress")) return "dresses";
  if (text.includes("top") || text.includes("shirt") || text.includes("blouse")) return "tops";
  if (text.includes("pant") || text.includes("jean") || text.includes("trouser")) return "bottoms";

  return "general";
}

/**
 * Get size recommendation
 */
export function getSizeRecommendation(product: MCPProduct, bodyShape: string): string {
  const category = determineProductCategory(product);

  const SIZE_RECOMMENDATIONS: { [key: string]: any } = {
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

  const recommendations = SIZE_RECOMMENDATIONS[bodyShape];
  if (!recommendations) {
    return "Choose your normal size and check the size chart";
  }

  return recommendations[category] || "Choose your normal size and check the size chart";
}

/**
 * Generate reasoning for recommendation
 */
export function generateRecommendationReasoning(product: MCPProduct, bodyShape: string, score: number): string {
  if (score > 0.7) {
    return `Excellent match for ${bodyShape} body shape - this style is highly recommended for your figure`;
  } else if (score > 0.5) {
    return `Good choice for ${bodyShape} body shape - this style complements your figure well`;
  } else {
    return `Suitable option for ${bodyShape} body shape - consider your personal style preferences`;
  }
}

export { BODY_SHAPE_PREFERENCES };
