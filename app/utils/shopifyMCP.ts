/**
 * Shopify Storefront MCP (Model Context Protocol) Client
 *
 * This service interfaces with Shopify's Storefront MCP server to:
 * - Search product catalogs
 * - Fetch product details
 * - Access store policies
 *
 * Endpoint: https://{storedomain}/api/mcp
 * No authentication required - public endpoint
 */

export interface MCPProduct {
  name: string;
  title?: string;  // Alias for name
  price: string;
  currency: string;
  variantId: string;
  url: string;
  imageUrl?: string;
  description?: string;
  handle?: string;
  productType?: string;
  tags?: string[];
  available?: boolean;
  // For API response compatibility
  id?: string;
  images?: Array<{ src: string }>;
  variants?: Array<{ price: string; available?: boolean }>;
}

export interface MCPSearchResponse {
  products: MCPProduct[];
  totalCount?: number;
}

/**
 * Search the Shopify store catalog using MCP
 */
export async function searchShopCatalog(
  storeDomain: string,
  query: string,
  context?: string
): Promise<MCPSearchResponse> {
  const mcpEndpoint = `https://${storeDomain}/api/mcp`;

  console.log(`🔍 Searching Shopify MCP catalog: "${query}" on ${storeDomain}`);

  try {
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 1,
        params: {
          name: 'search_shop_catalog',
          arguments: {
            query: query,
            context: context || 'AI fashion assistant searching for products'
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Parse the MCP response
    const products = parseProductsFromMCP(data.result, storeDomain);

    console.log(`✓ Found ${products.length} products from MCP`);

    return {
      products,
      totalCount: products.length
    };
  } catch (error) {
    console.error('❌ Error searching Shopify MCP catalog:', error);
    throw error;
  }
}

/**
 * Fetch ALL products from store by searching with empty/broad query
 * and body shape specific terms
 */
export async function fetchAllProducts(
  storeDomain: string,
  bodyShape?: string
): Promise<MCPProduct[]> {
  console.log(`📦 Fetching all products from ${storeDomain} via MCP...`);

  const allProducts: MCPProduct[] = [];
  const seenIds = new Set<string>();

  // Strategy: Search with broad terms to get maximum product coverage
  const searchQueries = [
    'clothing apparel fashion',
    'dress skirt top blouse',
    'pants jeans bottoms',
    'jacket blazer outerwear',
    'accessories shoes',
    'sale new arrivals'
  ];

  // Add body shape specific search if provided
  if (bodyShape) {
    const bodyShapeKeywords = getBodyShapeKeywords(bodyShape);
    searchQueries.push(bodyShapeKeywords.join(' '));
  }

  for (const query of searchQueries) {
    try {
      const response = await searchShopCatalog(storeDomain, query);

      // Deduplicate products by variant ID
      for (const product of response.products) {
        if (!seenIds.has(product.variantId)) {
          seenIds.add(product.variantId);
          allProducts.push(product);
        }
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(`⚠ Search query "${query}" failed:`, error);
      // Continue with other queries
    }
  }

  console.log(`✓ Fetched ${allProducts.length} unique products via MCP`);

  return allProducts;
}

/**
 * Parse products from MCP response
 */
function parseProductsFromMCP(result: any, storeDomain: string): MCPProduct[] {
  if (!result || !result.content) {
    console.warn('No content in MCP result');
    return [];
  }

  const products: MCPProduct[] = [];

  for (const item of result.content) {
    // MCP returns products as JSON text within a text field
    if (item.type === 'text' && item.text) {
      try {
        const data = JSON.parse(item.text);

        if (data.products && Array.isArray(data.products)) {
          for (const prod of data.products) {
            // Get the first available variant or first variant
            const firstVariant = prod.variants?.find((v: any) => v.available) || prod.variants?.[0];

            if (!firstVariant) continue;

            const productName = prod.title || '';
            const productPrice = firstVariant.price || prod.price_range?.min || '0';
            const productImage = firstVariant.image_url || prod.image_url || '';
            const productAvailable = firstVariant.available !== false;
            // Generate handle from title since MCP doesn't provide it
            const productHandle = generateHandleFromTitle(productName);
            const productUrl = `https://${storeDomain}/products/${productHandle}`;

            const product: MCPProduct = {
              name: productName,
              title: productName,
              price: productPrice,
              currency: firstVariant.currency || prod.price_range?.currency || 'USD',
              variantId: firstVariant.variant_id || '',
              url: productUrl,
              imageUrl: productImage,
              description: prod.description || '',
              handle: productHandle,
              productType: prod.product_type || '',
              tags: prod.tags || [],
              available: productAvailable,
              // For API response compatibility
              id: prod.product_id || firstVariant.variant_id,
              images: productImage ? [{ src: productImage }] : [],
              variants: prod.variants?.map((v: any) => ({
                price: v.price,
                available: v.available !== false
              })) || [{
                price: productPrice,
                available: productAvailable
              }]
            };

            if (product.variantId) {
              products.push(product);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse MCP JSON text:', error);
      }
    }
  }

  return products;
}

/**
 * Generate a URL-friendly handle from product title
 */
function generateHandleFromTitle(title: string): string {
  if (!title) return '';

  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length
}

/**
 * Extract product handle from URL or generate from product ID
 */
function extractHandle(urlOrId: string): string {
  if (!urlOrId) return '';

  try {
    // If it's a URL, extract the handle
    const match = urlOrId.match(/\/products\/([^/?]+)/);
    if (match) return match[1];

    // If it's a Shopify GID, extract the ID
    const gidMatch = urlOrId.match(/gid:\/\/shopify\/Product\/(\d+)/);
    if (gidMatch) return gidMatch[1];

    return urlOrId;
  } catch {
    return '';
  }
}

/**
 * Get search keywords for body shapes
 */
function getBodyShapeKeywords(bodyShape: string): string[] {
  const keywords: { [key: string]: string[] } = {
    "Pear/Triangle": ["a-line", "fit-and-flare", "empire", "bootcut", "wide-leg", "tops", "blouses"],
    "Apple/Round": ["empire", "v-neck", "scoop", "high-waist", "flowing", "wrap", "tunic"],
    "Hourglass": ["fitted", "wrap", "belted", "high-waist", "curve", "bodycon"],
    "Inverted Triangle": ["a-line", "wide-leg", "bootcut", "skirts", "pants"],
    "Rectangle/Straight": ["belted", "peplum", "structured", "layered", "cropped"],
    "V-Shape/Athletic": ["fitted", "straight-leg", "v-neck", "athletic", "casual"]
  };

  return keywords[bodyShape] || ["clothing", "fashion", "apparel"];
}

/**
 * Search store policies and FAQs
 */
export async function searchStorePolicies(
  storeDomain: string,
  query: string,
  context?: string
): Promise<string> {
  const mcpEndpoint = `https://${storeDomain}/api/mcp`;

  try {
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 1,
        params: {
          name: 'search_shop_policies_and_faqs',
          arguments: {
            query: query,
            context: context
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    // Extract the answer from the response
    const answer = data.result?.content?.[0]?.text || 'No answer found';

    return answer;
  } catch (error) {
    console.error('Error searching store policies:', error);
    throw error;
  }
}
