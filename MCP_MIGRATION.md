# Shopify Storefront MCP Migration

This app now uses the **Shopify Storefront MCP (Model Context Protocol) server** to fetch products and generate AI-powered recommendations.

## What is Shopify Storefront MCP?

Shopify's MCP server provides standardized endpoints for AI agents to interact with storefronts:
- **Endpoint**: `https://{storedomain}/api/mcp`
- **Protocol**: JSON-RPC 2.0
- **Authentication**: None required (public endpoint)
- **Documentation**: https://shopify.dev/docs/api/mcp

## Key Benefits

✅ **No Authentication Required** - Public endpoint, no access tokens needed
✅ **Built for AI** - Designed specifically for AI shopping assistants
✅ **Standardized Protocol** - JSON-RPC, consistent responses
✅ **Simpler Integration** - No Admin API complexity
✅ **Better Performance** - Uses Storefront API under the hood

## Architecture Changes

### Before (Admin API):
```
User Request → Authenticate → Admin API → Fetch Products → Filter → Claude → Response
```

### After (MCP):
```
User Request → MCP Storefront → Fetch Products → Filter → Claude → Response
             (No auth needed!)
```

## Files Structure

### New MCP Files:
- `app/utils/shopifyMCP.ts` - MCP client (search_shop_catalog, fetch products)
- `app/utils/mcpProductRecommendations.ts` - Product recommendation logic for MCP
- `app/utils/claudeRecommendations.ts` - Updated to use MCP products

### Removed Files:
- `app/utils/productRecommendations.ts` - Replaced by MCP version
- `app/utils/geminiRecommendations.ts` - Removed (Claude is now primary)
- `app/routes/api.gemini.recommendations.tsx` - Removed

## How It Works

### 1. Fetch Products via MCP
```typescript
import { fetchAllProducts } from "./shopifyMCP";

const storeDomain = "mystore.myshopify.com";
const products = await fetchAllProducts(storeDomain, bodyShape);

// Returns MCPProduct[] with:
// - name, price, currency
// - variantId, url, imageUrl
// - description, productType, tags
// - available (stock status)
```

### 2. Pre-filter Products
```typescript
// Remove products with "avoid" keywords for body shape
const preFiltered = preFilterProducts(products, bodyShape);

// Example avoid keywords:
// Pear: tight-fit-bottom, skinny-jean
// Apple: tight-waist, crop-top, bodycon
// Hourglass: oversized, baggy, shapeless
```

### 3. Send to Claude AI
```typescript
const recommendations = await getClaudeProductRecommendations(
  storeDomain,
  shop,
  bodyShape,
  measurements,
  limit,
  onlyInStock
);
```

## API Endpoint

### POST `/api/claude/recommendations`

**Request:**
```json
{
  "storeDomain": "mystore.myshopify.com",
  "bodyShape": "Hourglass",
  "bust": 91,
  "waist": 73,
  "hips": 99,
  "shoulders": 40,
  "gender": "female",
  "age": "25-34",
  "onlyInStock": true
}
```

**Response:**
```json
{
  "bodyShape": "Hourglass",
  "recommendations": [
    {
      "product": {
        "name": "Belted Wrap Dress",
        "price": "89.99",
        "currency": "USD",
        "variantId": "gid://shopify/ProductVariant/123",
        "url": "https://store.com/products/belted-wrap-dress",
        "imageUrl": "https://cdn.shopify.com/...",
        "description": "Beautiful fitted dress...",
        "productType": "Dresses",
        "tags": ["wrap", "belted", "fitted"],
        "available": true
      },
      "suitabilityScore": 0.95,
      "recommendedSize": "Size for bust, fitted styles work best",
      "reasoning": "Excellent match for Hourglass body shape...",
      "category": "dresses",
      "stylingTip": "Pair with heels to elongate silhouette"
    }
  ]
}
```

## MCP Search Strategy

The app fetches ALL products using multiple search queries:

```typescript
const searchQueries = [
  'clothing apparel fashion',
  'dress skirt top blouse',
  'pants jeans bottoms',
  'jacket blazer outerwear',
  'accessories shoes',
  'sale new arrivals'
];

// Plus body shape specific keywords:
// Hourglass: 'fitted wrap belted high-waisted curve bodycon'
```

Products are deduplicated by `variantId` across all searches.

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Claude AI API key (get from https://console.anthropic.com/)

Optional:
- Can also configure API key per-shop in admin UI (`/app/claude-settings`)

## Admin Settings

### Settings Page (`/app/settings`)
- **Number of Suggestions**: 1-100 (default: 30)
- **Minimum Match Score**: 0-100% (default: 30%)
- **Max Products to Scan**: 0-50000 (0 = ALL, default: 0)
- **Only In-Stock Products**: Yes/No (default: Yes)

### Claude AI Page (`/app/claude-settings`)
- **Enable/Disable**: Toggle Claude AI on/off
- **API Key**: Per-shop or use environment variable
- **System Prompt**: Customize Claude's role
- **Recommendation Prompt**: Customize analysis instructions
- **Temperature**: 0-1.0 (default: 0.7)
- **Max Tokens**: 1000-8000 (default: 4096)

## Migration Notes

### Breaking Changes:
1. API endpoint now requires `storeDomain` instead of `shopDomain`
2. Products are now `MCPProduct` type instead of `Product`
3. No longer needs authentication for product fetching

### Non-Breaking:
- Admin settings still work the same
- Claude AI configuration unchanged
- Response format compatible with existing frontend

## Testing

Test the MCP integration:

```bash
curl -X POST https://your-app.com/api/claude/recommendations \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "storeDomain=mystore.myshopify.com&bodyShape=Hourglass"
```

Expected flow:
```
📞 API Call: Getting Claude recommendations...
🔄 Fetching products from MCP for mystore.myshopify.com...
🔍 Searching Shopify MCP catalog: "clothing apparel fashion"
✓ Found 45 products from MCP
...
✓ Fetched 237 unique products via MCP
✓ Stock filter: 237 → 189 in-stock products
✓ Pre-filter (avoid keywords): 189 → 156 relevant products
✓ Prepared 156 products for Claude AI analysis
🤖 Calling Claude AI (model: claude-sonnet-4, temp: 0.7)...
✓ Claude AI returned 12 recommendations
```

## Troubleshooting

**MCP not returning products?**
- Verify store domain is correct (include `.myshopify.com`)
- Check if store has MCP enabled
- Some stores may restrict MCP access

**Claude failing?**
- Check `ANTHROPIC_API_KEY` is set
- Or configure in admin UI (`/app/claude-settings`)
- Falls back to basic algorithm if Claude unavailable

**No recommendations returned?**
- Check pre-filtering isn't too aggressive
- Lower "Minimum Match Score" in settings
- Verify products exist in store

## Future Enhancements

Potential MCP features to add:
- [ ] `get_cart` - Cart management
- [ ] `update_cart` - Add/remove items
- [ ] `search_shop_policies_and_faqs` - Policy queries
- [ ] Real-time inventory sync
- [ ] Multi-language support via MCP

---

**Last Updated**: 2025-01-08
**MCP Version**: Shopify Storefront MCP v1
**Claude Model**: claude-sonnet-4-20250514
