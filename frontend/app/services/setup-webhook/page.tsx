"use client";

export default function SetupWebhook() {
  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL}/webhooks/github`;
  const webhookSecret = process.env.NEXT_PUBLIC_WEBHOOK_SECRET || "(secret not set — check .env.local)";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Setup GitHub Webhook
      </h1>

      <p className="mt-4 text-sm text-gray-400">
        Add the following to your GitHub repository under{" "}
        <strong>Settings → Webhooks → Add webhook</strong>:
      </p>

      <div className="mt-4">
        <p className="font-semibold">Webhook URL:</p>
        <code className="block bg-gray-800 text-green-400 px-3 py-2 rounded mt-1 select-all">
          {webhookUrl}
        </code>
      </div>

      <div className="mt-4">
        <p className="font-semibold">Secret:</p>
        <code className="block bg-gray-800 text-yellow-400 px-3 py-2 rounded mt-1 select-all">
          {webhookSecret}
        </code>
      </div>

      <div className="mt-4">
        <p className="font-semibold">Content type:</p>
        <code className="block bg-gray-800 text-blue-300 px-3 py-2 rounded mt-1">
          application/json
        </code>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        Make sure to select <strong>Workflow runs</strong> under "Let me select individual events".
      </p>
    </div>
  );
}