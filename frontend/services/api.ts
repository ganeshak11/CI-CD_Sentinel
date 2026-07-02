import { Service } from "@/types/service";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getServices() {
  const response = await fetch(`${API_URL}/api/services`);

  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }

  const json = await response.json();
  return json.data || [];
}

export async function getDeployments(serviceId?: string) {
  const url = serviceId
    ? `${API_URL}/api/deployments?serviceId=${serviceId}`
    : `${API_URL}/api/deployments`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch deployments");
  }

  const json = await response.json();
  return json.data || [];
}

export async function getHealthStatus() {
  const response = await fetch(
    `${API_URL}/api/health-status`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch health status");
  }

  const json = await response.json();
  return json.data || [];
}

export async function createService(data: {
  name: string;
  repoUrl: string;
  pathFilter?: string;
  healthEndpoint: string;
  environment: string;
  rollbackStrategy?: string;
}) {
  const response = await fetch(
    `${API_URL}/api/services`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Backend validation error:", errorData);
    throw new Error(
      errorData.details
        ? JSON.stringify(errorData.details)
        : errorData.error || "Failed to create service"
    );
  }

  const json = await response.json();
  return json.data;
}