import { Client } from "@line/bot-sdk";

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

// LINE Clientを遅延初期化する関数
function getLineClient(): Client {
  if (!config.channelAccessToken) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN environment variable is required",
    );
  }
  if (!config.channelSecret) {
    throw new Error("LINE_CHANNEL_SECRET environment variable is required");
  }
  return new Client(config);
}

export interface LineMessageRequest {
  userId: string;
  message: string;
}

export async function sendLineMessage(
  request: LineMessageRequest,
): Promise<boolean> {
  try {
    console.log("🚀 Sending LINE message to user:", request.userId);
    console.log("📝 Message content:", request.message);
    console.log("🔑 Channel access token exists:", !!config.channelAccessToken);
    console.log("🔑 Channel secret exists:", !!config.channelSecret);

    // Validate that this looks like a LINE user ID
    if (!request.userId.startsWith("U") || request.userId.length < 30) {
      console.error("❌ Invalid LINE user ID format:", request.userId);
      throw new Error(
        'Invalid LINE user ID format. LINE user IDs should start with "U" and be approximately 33 characters long.',
      );
    }

    // 環境変数が設定されていない場合はエラーメッセージを返す
    if (!config.channelAccessToken || !config.channelSecret) {
      console.error("❌ LINE API credentials not configured");
      throw new Error(
        "LINE API credentials not configured. Please set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET environment variables.",
      );
    }

    const client = getLineClient();
    await client.pushMessage(request.userId, {
      type: "text",
      text: request.message,
    });

    console.log("✅ LINE message sent successfully to:", request.userId);
    return true;
  } catch (error) {
    console.error("❌ Failed to send LINE message:", error);

    // Log more details about the error
    if (error && typeof error === "object") {
      console.error("❌ Error details:", {
        message: (error as any).message,
        status: (error as any).statusCode || (error as any).status,
        response: (error as any).response?.data || "No response data",
      });
    }

    return false;
  }
}
