"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { getDeployments } from "@/services/api";
import { useRouter } from "next/navigation";

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    async function load() {
      const data = await getDeployments();

      setDeployments(data);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return <p>Loading...</p>;
  }

  function getBadge(status: string) {
    switch (status) {
      case "success":
        return "🟢 Success";

      case "failure":
        return "🔴 Failure";

      case "in_progress":
        return "🟡 In Progress";

      default:
        return "⚫ Cancelled";
    }
  }

  return (
    <>
      <Navbar />

      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">
          Deployments
        </h1>

        <table className="w-full border">
          <thead>
            <tr>
              <th>ID</th>
              <th>Branch</th>
              <th>Commit</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
            </tr>
          </thead>

          <tbody>
            {deployments.map((deployment: any) => (
              <tr
                key={deployment.id}
                className="cursor-pointer border"
                onClick={() =>
                  router.push(
                    `/deployments/${deployment.id}`
                  )
                }
              >
                <td>{deployment.id}</td>
                <td>{deployment.branch}</td>
                <td>{deployment.commitSha}</td>
                <td>{getBadge(deployment.status)}</td>
                <td>{deployment.startedAt}</td>
                <td>{deployment.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}