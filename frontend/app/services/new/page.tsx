import React from 'react';
"use client";

import { useState } from "react";
import { createService } from "@/services/api";
import { useRouter } from "next/navigation";

export default function NewService() {
  const router = useRouter();

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

    const result = await createService(form);

    router.push(
      `/services/setup-webhook?id=${result.id}`
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Register Service
      </h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <input
          placeholder="Service Name"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({
              ...form,
              name: e.target.value,
            })
          }
        />

        <input
          placeholder="Repository URL"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({
              ...form,
              repoUrl: e.target.value,
            })
          }
        />

        <input
          placeholder="Path Filter"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({
              ...form,
              pathFilter: e.target.value,
            })
          }
        />

        <input
          placeholder="Health Endpoint"
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({
              ...form,
              healthEndpoint:
                e.target.value,
            })
          }
        />

        <select
          className="border p-2 w-full"
          onChange={(e) =>
            setForm({
              ...form,
              environment:
                e.target.value,
            })
          }
        >
          <option>development</option>
          <option>staging</option>
          <option>production</option>
        </select>

        <button
          className="bg-blue-500 text-white px-4 py-2"
          type="submit"
        >
          Create Service
        </button>
      </form>
    </div>
  );
}