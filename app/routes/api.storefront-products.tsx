import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const STOREFRONT_API_VERSION = "2024-01";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const storefrontToken = url.searchParams.get("token");

  if (!shopDomain || !storefrontToken) {
    return json(
      { error: "Missing shop domain or storefront access token" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let fetchCount = 0;
    const maxFetches = 20; // Limit to prevent infinite loops (20 * 250 = 5000 products max)

    while (hasNextPage && fetchCount < maxFetches) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                title
                handle
                description
                productType
                tags
                availableForSale
                priceRange {
                  minVariantPrice {
                    amount
                  }
                }
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await fetch(
        `https://${shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": storefrontToken,
          },
          body: JSON.stringify({
            query,
            variables: { cursor },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Storefront API error: ${response.statusText}`);
      }

      const data = await response.json();
      const products = data.data?.products?.edges || [];

      // Transform products to match the format expected by the frontend
      const transformedProducts = products.map((edge: any) => ({
        title: edge.node.title,
        handle: edge.node.handle,
        image: edge.node.featuredImage?.url || null,
        price: edge.node.priceRange?.minVariantPrice?.amount || null,
        tags: edge.node.tags || [],
        productType: edge.node.productType || "",
        description: edge.node.description || "",
        available: edge.node.availableForSale,
      }));

      allProducts.push(...transformedProducts);

      hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data.data?.products?.pageInfo?.endCursor || null;
      fetchCount++;

      console.log(
        `Fetched ${transformedProducts.length} products (total: ${allProducts.length}, hasNextPage: ${hasNextPage})`
      );
    }

    console.log(`Total products fetched: ${allProducts.length}`);

    return json(
      {
        products: allProducts,
        productCount: allProducts.length,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching storefront products:", error);
    return json(
      { error: "Failed to fetch products", products: [], productCount: 0 },
      { status: 500, headers: corsHeaders }
    );
  }
}
