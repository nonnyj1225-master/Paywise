import { useState, useEffect } from "react";

interface Resource {
  id: number;
  title: string;
  description: string;
  category: string;
  url: string;
  phone: string;
}

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/resources");
        const data = await res.json();
        setResources(data.resources || []);
      } catch (err) {
        console.error("Failed to load resources:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categories = ["all", ...new Set(resources.map((r) => r.category))];
  const filtered = filter === "all" ? resources : resources.filter((r) => r.category === filter);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Resources</h2>
      <p className="text-sm text-gray-500">
        Free local financial counseling and education resources. You're not alone — help is available.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === cat
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Resource Cards */}
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{r.title}</h3>
                    <span className="inline-block mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 capitalize">
                      {r.category}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-600">{r.description}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Visit Website →
                    </a>
                  )}
                  {r.phone && (
                    <a href={`tel:${r.phone}`} className="text-gray-500 hover:text-gray-700">
                      📞 {r.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8">No resources in this category.</p>
          )}
        </>
      )}
    </div>
  );
}
