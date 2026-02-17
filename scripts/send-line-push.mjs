#!/usr/bin/env node

const usage = `
Usage:
  npm run line:push -- --user-id Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --message "Hello"

Required environment variable:
  LINE_CHANNEL_ACCESS_TOKEN
`;

function parseArgs(argv) {
  const args = { userId: "", message: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--user-id" && val) {
      args.userId = val;
      i += 1;
      continue;
    }
    if (key === "--message" && val) {
      args.message = val;
      i += 1;
      continue;
    }
    if (key === "--help" || key === "-h") {
      return { help: true };
    }
  }
  return args;
}

function isValidUserId(userId) {
  return /^U[0-9a-f]{32,}$/i.test(userId);
}

async function callLineApi(path, init, token) {
  const res = await fetch(`https://api.line.me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const raw = await res.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`LINE API ${res.status}: ${detail}`);
  }
  return body;
}

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const { userId, message, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(usage.trim());
    process.exit(0);
  }
  if (!token) {
    console.error("Missing LINE_CHANNEL_ACCESS_TOKEN");
    console.error(usage.trim());
    process.exit(1);
  }
  if (!userId || !message) {
    console.error("Both --user-id and --message are required");
    console.error(usage.trim());
    process.exit(1);
  }
  if (!isValidUserId(userId)) {
    console.error('Invalid user ID format. It should start with "U".');
    process.exit(1);
  }

  // Validate that this user is reachable by this Official Account.
  const profile = await callLineApi(
    `/v2/bot/profile/${encodeURIComponent(userId)}`,
    { method: "GET" },
    token,
  );
  console.log(`Profile OK: ${profile.displayName || "(no displayName)"}`);

  await callLineApi(
    "/v2/bot/message/push",
    {
      method: "POST",
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: message }],
      }),
    },
    token,
  );

  console.log("Push message sent.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
