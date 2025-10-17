import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

/**
 * TEMPORARY ADMIN ENDPOINT - Reset today's rate limit counter
 * This allows testing while Railway cache issue is being resolved
 */

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    console.log(`🔄 Resetting rate limit for ${shop}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Delete today's completed refresh logs
    const result = await db.productRefreshLog.deleteMany({
      where: {
        shop,
        startedAt: {
          gte: today,
        },
        status: "completed",
      },
    });

    console.log(`✅ Deleted ${result.count} refresh logs`);

    return json({
      success: true,
      message: `Rate limit reset - deleted ${result.count} refresh logs`,
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error("❌ Error resetting rate limit:", error);
    return json(
      {
        error: "Internal server error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
