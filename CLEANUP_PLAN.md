# 🧹 Cleanup Plan - Remove Unused Code

## Files to REMOVE (Unused/Old)

### ❌ Old API Endpoints (NOT using Gemini)
These are old recommendation endpoints that don't use the new Gemini architecture:

1. **`app/routes/api.recommendations.tsx`**
   - Old basic recommendation endpoint (no AI)
   - Uses simple tag matching
   - **Replace with:** `api.gemini.recommendations.tsx` ✅

2. **`app/routes/api.claude.recommendations.tsx`**
   - Old Claude AI endpoint ($900/month!)
   - Still functional but expensive
   - **Keep temporarily** as fallback, mark as deprecated
   - **TODO:** Remove after confirming Gemini works in production

### ❌ Old Utility Files (NOT using Gemini)

1. **`app/utils/storefrontRecommendations.ts`**
   - Basic tag-based matching (no AI)
   - Used by old `api.recommendations.tsx`
   - **Remove after** removing `api.recommendations.tsx`

2. **`app/utils/mcpProductRecommendations.ts`**
   - Uses MCP (Model Context Protocol) with Claude
   - Expensive and complex
   - **Remove after** confirming Gemini works

3. **`app/utils/shopifyMCP.ts`**
   - MCP wrapper for Shopify
   - Not needed with Gemini
   - **Remove after** removing `mcpProductRecommendations.ts`

4. **`app/utils/claudeRecommendations.ts`**
   - Claude AI implementation ($900/month)
   - **Keep temporarily** as reference/fallback
   - **TODO:** Remove after production validation

### ❌ Admin Pages (Old Settings)

1. **`app/routes/app.claude-settings.tsx`**
   - Claude API key settings page
   - **Replace with:** `app.gemini-settings.tsx` ✅
   - **TODO:** Remove after migrating stores to Gemini

### ⚠️ Potentially Unused API Endpoints (Need Review)

1. **`app/routes/api.storefront.products.tsx`**
   - Need to check if storefront still uses this
   - May be redundant with Gemini recommendations

2. **`app/routes/api.storefront-products.tsx`**
   - Similar to above, may be duplicate
   - Need to check usage

---

## Files to KEEP (Active/Used)

### ✅ New Gemini System
- `app/utils/geminiAnalysis.ts` - Phase 1 image analysis
- `app/utils/geminiRecommendations.ts` - Phase 2 recommendations
- `app/routes/api.admin.refresh.tsx` - Admin refresh endpoint
- `app/routes/api.gemini.recommendations.tsx` - Storefront endpoint
- `app/routes/app.gemini-settings.tsx` - Gemini API key settings

### ✅ Core Utilities (Still Needed)
- `app/utils/bodyShape.ts` - Body shape calculations
- `app/utils/settings.ts` - App settings management

### ✅ Other API Endpoints (Still Needed)
- `app/routes/api.body-shape.tsx` - Body shape calculator
- `app/routes/api.body-shape-analysis.tsx` - Body shape analysis
- `app/routes/api.color-season-analysis.tsx` - Color season analysis
- `app/routes/api.settings.tsx` - Settings API

### ✅ Admin Pages (Still Needed)
- `app/routes/app._index.tsx` - Main dashboard (updated with Gemini refresh button)
- `app/routes/app.settings.tsx` - App settings page
- `app/routes/app.additional.tsx` - Additional settings

---

## Cleanup Steps (Safe Migration Path)

### Phase 1: Mark as Deprecated (Immediate)
1. Add deprecation comments to old files:
   - `api.recommendations.tsx` → "DEPRECATED: Use api.gemini.recommendations.tsx"
   - `api.claude.recommendations.tsx` → "DEPRECATED: Use api.gemini.recommendations.tsx"
   - `app.claude-settings.tsx` → "DEPRECATED: Use app.gemini-settings.tsx"

### Phase 2: Update Storefront (Production)
1. Update storefront to use new endpoint: `/api/gemini/recommendations`
2. Test thoroughly in production
3. Monitor for errors

### Phase 3: Remove Old Code (After 30 Days)
Once Gemini is proven stable in production:

```bash
# Remove old API endpoints
rm app/routes/api.recommendations.tsx
rm app/routes/api.claude.recommendations.tsx

# Remove old utilities
rm app/utils/storefrontRecommendations.ts
rm app/utils/mcpProductRecommendations.ts
rm app/utils/shopifyMCP.ts
rm app/utils/claudeRecommendations.ts

# Remove old admin page
rm app/routes/app.claude-settings.tsx
```

### Phase 4: Database Cleanup (Optional)
After removal, consider cleaning up old database tables:
- `ClaudePromptSettings` - No longer used
- `OpenAISettings` - Never used (Gemini+OpenAI plan was skipped)
- `FilteredSelection` - Redundant (using FilteredSelectionWithImgAnalyzed)

**Note:** Keep these tables for now in case of rollback needs.

---

## Summary

**Immediate Actions:**
1. ✅ Created new Gemini system (geminiAnalysis.ts, geminiRecommendations.ts)
2. ✅ Created new API endpoints (api.admin.refresh.tsx, api.gemini.recommendations.tsx)
3. ✅ Created new admin UI (app.gemini-settings.tsx)
4. ✅ Updated main dashboard (app._index.tsx)

**Next Steps:**
1. Test Gemini system in development
2. Deploy to production
3. Update storefront to use new endpoint
4. Monitor for 30 days
5. Remove old code after validation

**Files Waiting for Removal:**
- 3 old API endpoints
- 4 old utility files
- 1 old admin page

**Estimated Total Lines Removed:** ~2,500+ lines of unused code
