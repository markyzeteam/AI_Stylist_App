export interface AppSettings {
  numberOfSuggestions: number;
  minimumMatchScore: number;
  maxProductsToScan: number;
  onlyInStockProducts: boolean;
  maxRefreshesPerDay: number;
}

// NOTE: minimumMatchScore of 30-50 is recommended for best results
// Scores 65-75 = good match, 75-85 = great match, 85+ = excellent match
// Setting minimumMatchScore too high (e.g., 70) may result in no recommendations
export const DEFAULT_SETTINGS: AppSettings = {
  numberOfSuggestions: 30,
  minimumMatchScore: 30,
  maxProductsToScan: 0, // 0 = ALL products
  onlyInStockProducts: true,
  maxRefreshesPerDay: 3, // Limit admin product refreshes per day
};

const METAFIELD_NAMESPACE = "yze_shopping_ai";
const METAFIELD_KEY = "app_settings";

/**
 * Load settings from Shopify metafields
 */
export async function loadSettings(admin: any): Promise<AppSettings> {
  try {
    const response = await admin.graphql(
      `#graphql
        query GetAppSettings {
          shop {
            metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
              value
            }
          }
        }`
    );

    const data = await response.json();
    const metafieldValue = data.data?.shop?.metafield?.value;

    if (metafieldValue) {
      const settings = JSON.parse(metafieldValue);
      return {
        ...DEFAULT_SETTINGS,
        ...settings
      };
    }

    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error loading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to Shopify metafields
 */
export async function saveSettings(
  admin: any,
  settings: AppSettings
): Promise<boolean> {
  try {
    // First, get the shop's GID
    const shopResponse = await admin.graphql(
      `#graphql
        query GetShop {
          shop {
            id
          }
        }`
    );

    const shopData = await shopResponse.json();
    const shopId = shopData.data?.shop?.id;

    if (!shopId) {
      console.error("Could not get shop ID");
      return false;
    }

    // Now save the metafield
    const response = await admin.graphql(
      `#graphql
        mutation CreateAppSettingsMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: JSON.stringify(settings),
              ownerId: shopId
            }
          ]
        }
      }
    );

    const data = await response.json();
    const userErrors = data.data?.metafieldsSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("Error saving settings:", userErrors);
      return false;
    }

    console.log("Settings saved successfully:", settings);
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}
