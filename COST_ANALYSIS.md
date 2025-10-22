# Cost Analysis for 7,120 Products

**Date:** October 22, 2025
**Store Size:** 7,120 products

---

## 📊 Cost Breakdown

### 1. **Phase 1: Initial Product Analysis (One-Time Setup)**

This is the initial refresh where all products need to be analyzed with Gemini AI.

#### Gemini API Costs

**Per Product:**
- Image input tokens: 258 tokens (based on code: api.admin.refresh.tsx:193)
- Output tokens: ~5,000 tokens (JSON analysis response)
- Input cost: `258 × $0.10 / 1,000,000 = $0.0000258` per product
- Output cost: `5,000 × $0.40 / 1,000,000 = $0.002` per product
- **Total per product: ~$0.002026** per product

**For 7,120 Products:**
- Total Gemini API calls: 7,120
- Total input tokens: 1,836,960 tokens
- Total output tokens: ~35,600,000 tokens
- **Total Gemini Cost: ~$14.42**

#### Railway Hosting Costs

- Hobby Plan: $5/month (includes $5 of compute)
- The refresh operation will take time, but likely won't exceed the $5 included compute
- **Estimated Railway Cost: $5/month** (your base hosting)

#### Total Initial Setup Cost

**$14.42 (Gemini) + $5 (Railway) = ~$19.42**

---

### 2. **Phase 2: Per Recommendation Request**

Each time a customer requests product recommendations.

#### What Happens During a Request

1. Loads ALL cached products from database (default: `maxProductsToScan = 0`)
   - For 7,120 products, this means all 7,120 products are sent to Gemini
2. No images are sent - only cached analysis data (text)
3. Gemini analyzes and returns recommendations

#### Gemini API Cost Per Request

**Input tokens per recommendation request:**
- System prompt: ~500 tokens (your CJLA prompt)
- Measurement info: ~100 tokens
- Body shape guidance: ~200 tokens
- **Per product data:** ~500 tokens each (title, description, tags, visual analysis)
  - 7,120 products × 500 tokens = **3,560,000 tokens**
- Instructions: ~500 tokens

**Total input per request: ~3,561,300 tokens**

**Output tokens per recommendation request:**
- Returning 30 recommendations with reasoning
- ~300 tokens per recommendation = **~9,000 tokens**

**Cost per recommendation request:**
- Input: `3,561,300 × $0.10 / 1,000,000 = $0.356`
- Output: `9,000 × $0.40 / 1,000,000 = $0.0036`
- **Total: ~$0.36 per request**

#### Railway Costs Per Request

- vCPU/RAM usage during API call: minimal
- Database query: minimal
- Estimated: ~$0.001-0.01 per request (depends on execution time)

#### Total Per Recommendation Request

**~$0.37 per customer request**

---

## 💰 Cost Projections

### Monthly Cost Estimates

| Daily Requests | Monthly Requests | Gemini Cost | Railway Cost | Total Monthly |
|---------------|------------------|-------------|--------------|---------------|
| 10            | ~300             | $108        | $5-10        | **~$113-118** |
| 25            | ~750             | $270        | $5-15        | **~$275-285** |
| 50            | ~1,500           | $540        | $10-20       | **~$550-560** |
| 100           | ~3,000           | $1,080      | $15-30       | **~$1,095-1,110** |
| 500           | ~15,000          | $5,400      | $50-100      | **~$5,450-5,500** |

---

## 🚨 Cost Optimization Strategies

### Option 1: Limit Products Sent to Gemini (RECOMMENDED)

**Problem:** Sending 7,120 products per request is expensive ($0.36 each)

**Solution:** Set `maxProductsToScan` parameter

```javascript
// In storefront call to /api/gemini/recommendations
maxProductsToScan: 500  // Only send top 500 products to Gemini
```

**New cost per request:**
- Input: `500 products × 500 tokens + 1,300 = 251,300 tokens`
- Cost: `251,300 × $0.10 / 1,000,000 = $0.025`
- Output: `9,000 × $0.40 / 1,000,000 = $0.0036`
- **Total: ~$0.029 per request** (93% savings!)

| Daily Requests | Monthly Cost (500 product limit) |
|---------------|----------------------------------|
| 10            | **~$9**                          |
| 25            | **~$22**                         |
| 50            | **~$44**                         |
| 100           | **~$87**                         |
| 500           | **~$435**                        |

### Option 2: Smart Product Pre-Filtering

Add filtering logic BEFORE calling Gemini:

1. **Gender-based filtering** ✅ (already implemented)
2. **Category filtering** - Only send relevant categories for body shape
3. **Price range filtering** - Filter by customer's budget preference
4. **Stock filtering** - Remove out-of-stock items
5. **Priority score filtering** - Only send high-priority products

### Option 3: Implement Response Caching

Cache recommendations by body shape + color season:

```
Cache key: "hourglass-spring-sustainability-budget-low"
Cache duration: 1-24 hours
```

**Benefits:**
- First request: $0.36 (full cost)
- Subsequent identical requests: $0.00 (cache hit)
- Typical cache hit rate: 40-70%

**Cost reduction:**
- 50% cache hit rate = **50% savings**
- 70% cache hit rate = **70% savings**

---

## 📈 Recommended Configuration

### For Low-Medium Traffic Stores (10-50 requests/day)

```javascript
// Storefront configuration
maxProductsToScan: 500,
numberOfSuggestions: 30,
minimumMatchScore: 30,
onlyInStock: true,  // Reduces product count
```

**Expected costs:**
- Monthly Gemini: ~$9-44
- Monthly Railway: ~$5-10
- **Total: ~$14-54/month**

### For High-Traffic Stores (100+ requests/day)

```javascript
// Add caching layer
maxProductsToScan: 300,  // Further reduced
cacheEnabled: true,
cacheDuration: 3600,  // 1 hour
```

**With 60% cache hit rate:**
- Monthly Gemini: ~$35 (instead of $87)
- Monthly Railway: ~$15
- **Total: ~$50/month** (instead of $102)

---

## 🔍 Current Implementation Issues

### Issue: No Product Limit by Default

**Location:** `app/routes/api.gemini.recommendations.tsx:54`

```typescript
const maxProductsToScan = parseInt(formData.get("maxProductsToScan") as string) || 0;
```

- Default value: `0` means **ALL products**
- For 7,120 products: **$0.36 per request**

### Recommended Fix

```typescript
const maxProductsToScan = parseInt(formData.get("maxProductsToScan") as string) || 500;
```

**This single change would reduce costs by 93%!**

---

## 💡 Additional Cost-Saving Tips

### 1. Product Refresh Strategy

**Current:** Products are re-analyzed if >30 days old

**Optimization:**
- Increase to 90 days for stable products
- Only re-analyze products with updated images
- Skip analysis for accessories/simple items

### 2. Smart Token Management

**Current:** Full product descriptions sent to Gemini

**Optimization:**
- Truncate descriptions to 300 chars (already implemented ✅)
- Remove redundant tags
- Compress visual analysis data

### 3. Batch Processing During Low Traffic

- Run product refresh during off-peak hours
- Spread analysis over multiple days
- Use free tier limits effectively

---

## 📊 Cost Comparison Summary

| Configuration | Cost Per Request | 100 Requests/Day Monthly Cost |
|--------------|------------------|-------------------------------|
| **Current (all 7,120 products)** | $0.36 | **$1,095** |
| With 500 product limit | $0.029 | **$87** |
| With 300 product limit | $0.018 | **$54** |
| With 300 limit + 60% caching | $0.007 | **$21** |

---

## ✅ Action Items

1. **IMMEDIATE:** Add default `maxProductsToScan: 500` in API endpoint
2. **SHORT-TERM:** Implement recommendation caching layer
3. **MEDIUM-TERM:** Add smart pre-filtering by category/price
4. **LONG-TERM:** A/B test optimal product limit for quality vs. cost

---

**Notes:**
- Costs are estimates based on Gemini 2.0 Flash pricing ($0.10 input / $0.40 output per 1M tokens)
- Actual token counts may vary based on product data complexity
- Railway costs vary by actual compute usage
- Monitor usage via Railway dashboard and Gemini API console
