import React, { useState } from "react";
import axios from "axios";
import "./Search.css"

interface PackageQuery {
  Version: string;
  Name: string;
}

interface PackageResponse {
  Version: string;
  Name: string;
  ID: string;
}
const API_URL = "http://localhost:5000/api/packages"; 

const PackagesPage: React.FC = () => {
  const [query, setQuery] = useState<PackageQuery[]>([
    { Version: "", Name: "" },
  ]);
  const [packages, setPackages] = useState<PackageResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchPackages = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(API_URL, query, {
        headers: { "Content-Type": "application/json" },
      });

      if (response.data) {
        setPackages(response.data);
      }
    } catch (err) {
      console.error("Error fetching packages:", err);
      setError("Failed to fetch packages. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (index: number, field: string, value: string) => {
    const updatedQuery = [...query];
    updatedQuery[index][field as keyof PackageQuery] = value;
    setQuery(updatedQuery);
  };

  const addQueryField = () => {
    setQuery([...query, { Version: "", Name: "" }]);
  };

  const removeQueryField = (index: number) => {
    const updatedQuery = [...query];
    updatedQuery.splice(index, 1);
    setQuery(updatedQuery);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Package Registry</h1>
      <p>Search for packages satisfying your query.</p>

      <div>
        {query.map((q, index) => (
          <div key={index} style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Version (e.g., 1.2.3)"
              value={q.Version}
              onChange={(e) =>
                handleQueryChange(index, "Version", e.target.value)
              }
              style={{ marginRight: "10px" }}
            />
            <input
              type="text"
              placeholder="Package Name (e.g., react)"
              value={q.Name}
              onChange={(e) =>
                handleQueryChange(index, "Name", e.target.value)
              }
              style={{ marginRight: "10px" }}
            />
            <button onClick={() => removeQueryField(index)}>Remove</button>
          </div>
        ))}
        <button onClick={addQueryField}>Add Query Field</button>
      </div>

      <button
        onClick={handleFetchPackages}
        disabled={loading}
        style={{ marginTop: "20px" }}
      >
        {loading ? "Loading..." : "Fetch Packages"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: "20px" }}>
        {packages.length > 0 && (
          <table border={1} style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg, index) => (
                <tr key={index}>
                  <td>{pkg.Name}</td>
                  <td>{pkg.Version}</td>
                  <td>{pkg.ID}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PackagesPage;
