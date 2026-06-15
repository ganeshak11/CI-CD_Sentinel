"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import {
  getServices,
  getHealthStatus,
} from "@/services/api";

export default function Dashboard() {
  const [services, setServices] = useState([]);
  const [health, setHealth] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const serviceData = await getServices();
      const healthData = await getHealthStatus();

      setServices(serviceData);
      setHealth(healthData);
    } catch (error) {
      console.error(error);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 30000);

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
          {services.map((service: any) => {
            const status = health.find(
              (h: any) => h.serviceId === service.id
            );

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
                  Status:
                  {status?.healthy ? " 🟢 Healthy" : " 🔴 Down"}
                </p>

                <p>
                  Last Deployment:
                  {service.lastDeploymentTime ||
                    "No Deployments"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}