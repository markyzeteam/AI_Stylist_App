# How to Fix Custom Prompts

## Problem
The database migrated from 6 prompts to 3 prompts, but your existing custom prompts are still in the OLD columns. The app is now using default prompts instead.

## Solution

### Option 1: Reset to New Defaults (Recommended)
1. Go to Admin → Gemini Settings
2. Scroll to "Custom Prompts" section
3. Click "Reset to Defaults" button
4. Click "Save Custom Prompts"

This will:
- Clear old prompts (bodyShapePrompt, colorSeasonPrompt, etc.)
- Set new 3-prompt defaults:
  - Prompt 1: Product Image Analysis
  - Prompt 2: Customer Analysis (combined)
  - Prompt 3: Product Recommendations

### Option 2: Manually Combine Your Old Prompts
1. Go to Admin → Gemini Settings
2. Find "Prompt 2: Customer Analysis (Combined)"
3. Manually combine your old prompts into ONE:
   - Old bodyShapePrompt
   - Old colorSeasonPrompt  
   - Old celebrityPrompt
   - Old valuesPrompt
   
   → Combine all into customerAnalysisPrompt

4. Click "Save Custom Prompts"

## Verify It's Working
After saving, check the logs for:
```
hasCustomerAnalysisPrompt: true
promptLength: <should be longer than 1187 if you have custom>
```

The OLD prompt text should be gone.




