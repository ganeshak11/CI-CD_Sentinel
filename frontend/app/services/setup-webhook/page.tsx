"use client";

import { useEffect, useState } from "react";

export default function SetupWebhook() {
  const [webhookUrl, setWebhookUrl] = useState("http://localhost:3001/webhooks/github");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/webhooks/github`);
    }
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Setup GitHub Webhook
      </h1>

      <p className="mt-4">
        Webhook URL:
      </p>

      <code>
        {webhookUrl}
      </code>

      <p className="mt-4">
        Secret:
      </p>

      <code>
        GITHUB_WEBHOOK_SECRET
      </code>
    </div>
  );
}