import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

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
    // Get shop from query params
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      return json(
        { error: "Shop parameter is required", products: [], productCount: 0 },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get access token from database
    console.log('Fetching session for shop:', shop);

    const sessionRecord = await prisma.session.findFirst({
      where: {
        shop,
      },
      orderBy: {
        id: 'desc',
      },
    });

    console.log('Session record found:', !!sessionRecord);

    if (!sessionRecord) {
      console.error('No session found for shop:', shop);
      return json(
        { error: "No active session found for this shop", products: [], productCount: 0 },
        { status: 401, headers: corsHeaders }
      );
    }

    // Access token is a direct field in the Session model
    const accessToken = sessionRecord.accessToken;

    console.log('Access token exists:', !!accessToken);
    if (accessToken) {
      console.log('Access token prefix:', accessToken.substring(0, 15));
    } else {
      console.error('No access token in session record');
      return json(
        { error: "No access token found in session", products: [], productCount: 0 },
        { status: 401, headers: corsHeaders }
      );
    }

    const allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                description
                productType
                tags
                status
                variants(first: 1) {
                  edges {
                    node {
                      price
                    }
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

      const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { cursor },
        }),
      });

      console.log('Response status:', response.status, response.statusText);

      const data = await response.json();
      console.log('Response data:', JSON.stringify(data).substring(0, 500));

      if (data.errors) {
        console.error('GraphQL errors:', JSON.stringify(data.errors));
      }

      const products = data?.data?.products?.edges || [];

      // Transform products to match the format expected by the frontend
      const transformedProducts = products.map((edge: any) => ({
        title: edge.node.title,
        handle: edge.node.handle,
        image: edge.node.featuredImage?.url || null,
        price: edge.node.variants?.edges?.[0]?.node?.price || null,
        tags: edge.node.tags || [],
        productType: edge.node.productType || "",
        description: edge.node.description || "",
        available: edge.node.status === 'ACTIVE',
      }));

      allProducts.push(...transformedProducts);

      hasNextPage = data?.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data?.data?.products?.pageInfo?.endCursor || null;

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
