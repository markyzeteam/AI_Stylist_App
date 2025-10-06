import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface AppSettings {
  numberOfSuggestions: number;
  minimumMatchScore: number;
  maxProductsToScan: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  numberOfSuggestions: 30,
  minimumMatchScore: 30,
  maxProductsToScan: 1000,
};

const METAFIELD_NAMESPACE = "yze_shopping_ai";
const METAFIELD_KEY = "app_settings";

/**
 * Load settings from Shopify metafields
 */
export async function loadSettings(admin: AdminApiContext): Promise<AppSettings> {
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
  admin: AdminApiContext,
  settings: AppSettings
): Promise<boolean> {
  try {
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
              ownerId: "gid://shopify/Shop/1"
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

    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}
