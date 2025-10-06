import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

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

  try {
    // Authenticate - this endpoint is called from the storefront but we'll use session-less auth
    const { admin } = await authenticate.public.appProxy(request);

    const allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let fetchCount = 0;
    const maxFetches = 20; // 20 * 250 = 5000 products max

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

      const response = await admin.graphql(query, {
        variables: { cursor },
      });

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
    console.error("Error fetching products:", error);
    return json(
      { error: "Failed to fetch products", products: [], productCount: 0 },
      { status: 500, headers: corsHeaders }
    );
  }
}
