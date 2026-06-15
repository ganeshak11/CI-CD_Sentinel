export default function SetupWebhook() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Setup GitHub Webhook
      </h1>

      <p className="mt-4">
        Webhook URL:
      </p>

      <code>
        http://localhost:3001/webhooks/github
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