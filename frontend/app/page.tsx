"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { getServices } from "@/services/api";
import { Service } from "@/types/service";

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const serviceData = await getServices();
      setServices(Array.isArray(serviceData) ? serviceData : []);
    } catch (error) {
      console.error("Dashboard load error:", error);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <>
      <Navbar />

      <div className="p-6">
        <h1 className="text-3xl font-bold mb-5">
          CI-CD Sentinel Dashboard
        </h1>

        <div className="grid md:grid-cols-3 gap-4">
          {services.map((service: Service) => {
            const healthStatus = service.latestHealth?.status;
            const isHealthy = healthStatus === "healthy";
            const deployment = service.latestDeployment;

            return (
              <div
                key={service.id}
                className="border rounded p-4 shadow"
              >
                <h2 className="font-bold text-lg">
                  {service.name}
                </h2>

                <p>{service.repoUrl}</p>

                <p className="mt-2">
                  Status:{" "}
                  {healthStatus
                    ? isHealthy
                      ? "🟢 Healthy"
                      : "🔴 Down"
                    : "⚪ Unknown"}
                </p>

                <p>
                  Last Deployment:{" "}
                  {deployment
                    ? `${deployment.conclusion ?? deployment.status} on ${deployment.branch} (${new Date(deployment.startedAt).toLocaleString()})`
                    : "No Deployments"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
