const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getServices() {
  const response = await fetch(`${API_URL}/api/services`);

  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }

  return response.json();
}

export async function getDeployments(serviceId?: string) {
  const url = serviceId
    ? `${API_URL}/api/deployments?serviceId=${serviceId}`
    : `${API_URL}/api/deployments`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch deployments");
  }

  return response.json();
}

export async function getHealthStatus() {
  const response = await fetch(
    `${API_URL}/api/health-status`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch health status");
  }

  return response.json();
}

export async function createService(data: any) {
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
    throw new Error("Failed to create service");
  }

  return response.json();
}