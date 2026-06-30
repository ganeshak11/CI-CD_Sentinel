
"use client";

import { useState } from "react";
import { createService } from "@/services/api";
import { useRouter } from "next/navigation";

export default function NewService() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    repoUrl: "",
    pathFilter: "",
    healthEndpoint: "",
    environment: "development",
    rollbackStrategy: "rerun",
  });

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await createService(form);
      router.push(`/services/setup-webhook?id=${result.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Register Service
      </h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <input
          placeholder="Service Name (e.g. My API)"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
        />

        <div>
          <input
            placeholder="Repository (e.g. ganeshak11/CI-CD_Sentinel)"
            className="border p-2 w-full"
            onChange={(e) =>
              setForm({ ...form, repoUrl: e.target.value })
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Use <code>org/repo</code> format — not a full URL
          </p>
        </div>

        <input
          placeholder="Path Filter (optional, e.g. src/)"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({ ...form, pathFilter: e.target.value })
          }
        />

        <div>
          <input
            placeholder="Health Endpoint (e.g. http://my-service.com/health)"
            className="border p-2 w-full"
            onChange={(e) =>
              setForm({ ...form, healthEndpoint: e.target.value })
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Must be a full URL including <code>http://</code> or <code>https://</code>
          </p>
        </div>

        <select
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({ ...form, environment: e.target.value })
          }
        >
          <option>development</option>
          <option>staging</option>
          <option>production</option>
        </select>

        <button
          className="bg-blue-500 text-white px-4 py-2 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Service"}
        </button>
      </form>
    </div>
  );
}