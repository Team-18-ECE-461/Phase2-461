import React, { useState } from "react";
import axios from "axios";
import "./Reset.css";

// Updated to point to your local backend proxy
const API_URL = "http://localhost:5000/api/reset";
const ResetRegistryPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleReset = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await axios.post(API_URL, {
      });
      setMessage("Registry reset successfully.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Error resetting registry:", error.message);
        setMessage(`Error: ${error.response?.data || error.message}`);
      } else {
        console.error("Unexpected error:", error);
        setMessage("Unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-registry-page">
      <h1>Reset Registry</h1>
      <p>Click the button below to reset the registry.</p>

      <button
        className="reset-button"
        onClick={handleReset}
        disabled={loading}
      >
        {loading ? "Resetting..." : "Reset Registry"}
      </button>

      {message && <p className="reset-message">{message}</p>}
    </div>
  );
};

export default ResetRegistryPage;
