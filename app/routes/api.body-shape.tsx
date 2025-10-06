import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { calculateBodyShape } from "../utils/bodyShape";

export async function action({ request }: ActionFunctionArgs) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await request.json();
    const { measurements, bodyShape, action: actionType } = body;

    switch (actionType) {
      case "calculate":
        if (!measurements) {
          return json({ error: "Measurements required" }, { status: 400, headers });
        }

        const result = calculateBodyShape(measurements);
        return json({ result }, { headers });

      case "recommendations":
        if (!bodyShape) {
          return json({ error: "Body shape required" }, { status: 400, headers });
        }

        // For customer-facing interface, we'll return static recommendations
        // In a full implementation, this would connect to your product catalog
        const recommendations = getStaticRecommendations(bodyShape);
        return json({ recommendations }, { headers });

      default:
        return json({ error: "Invalid action" }, { status: 400, headers });
    }
  } catch (error) {
    console.error("API Error:", error);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    };
    return json({ error: "Internal server error" }, { status: 500, headers });
  }
}

// Static recommendations for customer-facing interface
function getStaticRecommendations(bodyShape: string) {
  const recommendations = {
    "Pear/Triangle": [
      {
        category: "Dresses",
        items: ["A-line dresses", "Fit-and-flare dresses", "Empire waist dresses"],
        reason: "These styles balance your proportions by drawing attention upward"
      },
      {
        category: "Tops",
        items: ["Boat neck tops", "Wide necklines", "Statement sleeves"],
        reason: "Broader necklines help balance wider hips"
      },
      {
        category: "Bottoms",
        items: ["Bootcut jeans", "Wide-leg pants", "Straight-leg trousers"],
        reason: "These cuts complement your hip line without adding bulk"
      }
    ],
    "Apple/Round": [
      {
        category: "Dresses",
        items: ["Empire waist dresses", "Wrap dresses", "A-line dresses"],
        reason: "These styles create a defined waistline and flow over the midsection"
      },
      {
        category: "Tops",
        items: ["V-neck tops", "Scoop necks", "Flowing blouses"],
        reason: "V-necks elongate the torso and create a flattering silhouette"
      },
      {
        category: "Bottoms",
        items: ["High-waisted jeans", "Straight-leg pants", "Wide-leg trousers"],
        reason: "High waistlines help define your waist and create balance"
      }
    ],
    "Hourglass": [
      {
        category: "Dresses",
        items: ["Bodycon dresses", "Wrap dresses", "Fit-and-flare dresses"],
        reason: "These styles highlight your natural waistline and curves"
      },
      {
        category: "Tops",
        items: ["Fitted tops", "Wrap tops", "Belted blouses"],
        reason: "Fitted styles showcase your proportioned figure"
      },
      {
        category: "Bottoms",
        items: ["High-waisted jeans", "Pencil skirts", "Fitted pants"],
        reason: "These emphasize your waist and complement your curves"
      }
    ],
    "Inverted Triangle": [
      {
        category: "Dresses",
        items: ["A-line dresses", "Fit-and-flare dresses", "Shift dresses"],
        reason: "These styles balance broader shoulders with fuller hips"
      },
      {
        category: "Tops",
        items: ["Scoop necks", "V-necks", "Simple necklines"],
        reason: "Simpler necklines minimize shoulder emphasis"
      },
      {
        category: "Bottoms",
        items: ["Wide-leg pants", "Bootcut jeans", "A-line skirts"],
        reason: "These add volume to your lower half for balance"
      }
    ],
    "Rectangle/Straight": [
      {
        category: "Dresses",
        items: ["Belted dresses", "Peplum dresses", "Wrap dresses"],
        reason: "These styles create the illusion of curves and define your waist"
      },
      {
        category: "Tops",
        items: ["Peplum tops", "Belted blouses", "Layered tops"],
        reason: "These add dimension and create waist definition"
      },
      {
        category: "Bottoms",
        items: ["High-waisted pants", "Skinny jeans", "Structured skirts"],
        reason: "These help create curves and add shape to your silhouette"
      }
    ],
    "V-Shape/Athletic": [
      {
        category: "Clothing",
        items: ["Fitted shirts", "Straight-leg pants", "Casual wear"],
        reason: "Clean, fitted styles complement your athletic build"
      },
      {
        category: "Tops",
        items: ["V-necks", "Crew necks", "Minimal designs"],
        reason: "Simple necklines work well with your strong shoulder line"
      },
      {
        category: "Bottoms",
        items: ["Straight-leg jeans", "Chinos", "Athletic wear"],
        reason: "Straight cuts complement your proportioned build"
      }
    ]
  };

  return recommendations[bodyShape as keyof typeof recommendations] || [];
}