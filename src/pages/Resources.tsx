import { useState, useEffect } from "react";

interface Resource {
  id: number;
  title: string;
  description: string;
  category: string;
  url: string;
  phone: string;
  region: string;
}

interface PayProfile {
  region: string;
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [userRegion, setUserRegion] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [resRes, profRes] = await Promise.all([
          fetch("/api/resources"),
          fetch("/api/profiles/current"),
        ]);
        const resData = await resRes.json();
        const profData = await profRes.json();

        setResources(resData.resources || []);
        if (profData.profile?.region) {
          setUserRegion(profData.profile.region.toUpperCase());
        }
      } catch (err) {
        console.error("Failed to load resources:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categories = ["all", ...new Set(resources.map((r) => r.category))];

  const stateName = userRegion && US_STATE_NAMES[userRegion]
    ? US_STATE_NAMES[userRegion]
    : userRegion;

  // Sort: state-specific resources first when user has a region set
  const sorted = [...resources].sort((a, b) => {
    if (userRegion) {
      const aIsLocal = a.region.toUpperCase() === userRegion;
      const bIsLocal = b.region.toUpperCase() === userRegion;
      if (aIsLocal && !bIsLocal) return -1;
      if (!aIsLocal && bIsLocal) return 1;
    }
    // National (US) before other state-specific
    const aIsNational = a.region === "US";
    const bIsNational = b.region === "US";
    if (aIsNational && !bIsNational) return -1;
    if (!aIsNational && bIsNational) return 1;
    return 0;
  });

  // Apply category filter
  const categoryFiltered = categoryFilter === "all"
    ? sorted
    : sorted.filter((r) => r.category === categoryFilter);

  // Apply search filter
  const query = searchQuery.toLowerCase().trim();
  const filtered = query
    ? categoryFiltered.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query)
      )
    : categoryFiltered;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Resources</h2>
      <p className="text-sm text-gray-500">
        Free local financial counseling and education resources. You're not alone — help is available.
      </p>

      {/* Region hint */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-2.5 text-sm">
        {userRegion ? (
          <p>
            📍 <span className="font-medium text-indigo-700">Showing resources for {stateName}</span>
            <span className="text-indigo-500"> — plus national resources available everywhere.</span>
          </p>
        ) : (
          <p>
            🌎 <span className="font-medium text-indigo-700">Showing national + local resources</span>
            <span className="text-indigo-500"> — set your state in Settings to see local results first.</span>
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Search bar */}
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resources by title or description..."
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
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
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 capitalize">
                        {r.category}
                      </span>
                      {r.region && r.region !== "US" && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          userRegion && r.region.toUpperCase() === userRegion
                            ? "bg-green-100 text-green-700"
                            : "bg-indigo-50 text-indigo-600"
                        }`}>
                          {US_STATE_NAMES[r.region] || r.region}
                        </span>
                      )}
                      {r.region === "US" && (
                        <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          National
                        </span>
                      )}
                    </div>
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

          {filtered.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-gray-400">
                {searchQuery
                  ? `No resources match "${searchQuery}". Try a different search.`
                  : "No resources in this category."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
