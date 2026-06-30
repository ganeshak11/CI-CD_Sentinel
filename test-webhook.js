const crypto = require("crypto");

const SECRET = "8be84389eaf184d5c8a5cdd61a6b4c10455099a0eaddd7195c833039fbb94c4d";
const URL = "http://localhost:3001/webhooks/github";

// Fixed run ID — used to test idempotency (run twice, only 1 Deployment node created)
const FIXED_RUN_ID = 123456789;

const payload = {
  action: "completed",
  workflow_run: {
    id: FIXED_RUN_ID,
    name: "CI Pipeline",
    status: "completed",
    conclusion: "failure", // simulating a failed run for testing
    head_branch: "main",
    head_sha: "c6eb6b29de84d36abc123",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    actor: { login: "ganeshak11" },
    head_commit: {
      message: "Test commit for V1 webhook test",
      author: { name: "Ganesh", email: "ganesh@example.com" },
      timestamp: new Date().toISOString(),
    },
  },
  // repository is at TOP LEVEL in real GitHub payloads
  repository: {
    full_name: "ganeshak11/CI-CD_Sentinel", // must match the repoUrl registered in the dashboard
    html_url: "https://github.com/ganeshak11/CI-CD_Sentinel",
  },
};


const body = JSON.stringify(payload);

// GitHub uses HMAC-SHA256
const signature = crypto
  .createHmac("sha256", SECRET)
  .update(body)
  .digest("hex");

async function run() {
  console.log("Sending simulated webhook to", URL);
  
  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "workflow_run",
        "X-Hub-Signature-256": `sha256=${signature}`,
      },
      body: body,
    });

    console.log("Response Status:", response.status);
    const text = await response.text();
    console.log("Response Body:", text);
    
    if (response.status === 200 && text.includes("ignored") || text === "") {
        console.log("\n⚠️ Note: If this returned 200 OK but nothing was created, make sure you register 'test-org/test-repo' via the dashboard first!");
    }
  } catch (error) {
    console.error("Error sending webhook:", error.message);
  }
}

run();
