import React, { useState } from "react";
import axios from "axios";
import "./Cost.css";
const API_BASE_URL = "http://localhost:5000/api/package"; // Base URL for API

const PackageInfoPage: React.FC = () => {
  const [packageId, setPackageId] = useState<string>("");
  const [dependency, setDependency] = useState<boolean>(false);
  const [cost, setCost] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch the cost of the package
  const fetchCost = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/${packageId}/cost`, {
        headers: {
          "X-Authorization": "your-auth-token", // Replace with actual token
        },
        params: {
          dependency,
        },
      });
      setCost(response.data[packageId]?.totalCost || null);
    } catch (error) {
      handleError(error);
    }
  };

  // Fetch the rate of the package
  const fetchRate = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/${packageId}/rate`, {
        headers: {
          "X-Authorization": "your-auth-token", // Replace with actual token
        },
      });
      setRate(response.data?.NetScore || null);
    } catch (error) {
      handleError(error);
    }
  };

  // Handle errors
  const handleError = (error: any) => {
    if (axios.isAxiosError(error)) {
      setMessage(error.response?.data?.message || "An error occurred.");
    } else {
      setMessage("Unexpected error occurred.");
    }
    console.error(error);
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!packageId) {
      setMessage("Package ID is required.");
      return;
    }

    setLoading(true);
    setMessage(null);

    await fetchCost();
    await fetchRate();

    setLoading(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Package Info</h1>
      <p>Enter the Package ID to fetch its cost and rate.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Package ID:
          <input
            type="text"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            placeholder="Enter package ID"
            required
          />
        </label>
        <br />
        <label>
          Include Dependencies:
          <input
            type="checkbox"
            checked={dependency}
            onChange={(e) => setDependency(e.target.checked)}
          />
        </label>
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Get Info"}
        </button>
      </form>

      {message && <p style={{ color: "red" }}>{message}</p>}

      <div style={{ marginTop: "20px" }}>
        {cost !== null && (
          <p>
            <strong>Cost:</strong> {cost}
          </p>
        )}
        {rate !== null && (
          <p>
            <strong>Rate (NetScore):</strong> {rate} 
          </p>
        )}
      </div>
    </div>
  );
};

export default PackageInfoPage;
