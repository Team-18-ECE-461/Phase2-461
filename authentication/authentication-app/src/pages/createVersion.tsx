import React, { useState } from "react";
import axios from "axios";
import "./CreateVersion.css";

const API_URL = "http://localhost:5000/api/package/id";

interface Metadata {
  Name: string;
  Version: string;
  ID: string;
}

interface Data {
  Name: string;
  Content: string;
  URL: string;
  debloat: boolean;
  JSProgram: string;
}

interface RequestBody {
  metadata: Metadata;
  data: Data;
}

const CreateVersionPage: React.FC = () => {
  const [packageId, setPackageId] = useState<string>("");
  const [metadata, setMetadata] = useState<Metadata>({
    Name: "",
    Version: "",
    ID: "",
  });
  const [data, setData] = useState<Data>({
    Name: "",
    Content: "",
    URL: "",
    debloat: false,
    JSProgram: "",
  });
  const [message, setMessage] = useState<string | null>(null);

const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Validation: All required fields must be provided
    if (
        !metadata.Name ||
        !metadata.Version ||
        !packageId ||
        !data.Name ||
        !data.JSProgram ||
        (!data.Content && !data.URL) ||
        (data.Content && data.URL)
    ) {
        setMessage(
            "Invalid request: All fields are required. Provide either Content or URL (but not both)."
        );
        return;
    }

    const requestBody: RequestBody = {
        metadata: {
            ...metadata,
            ID: packageId,
        },
        data,
    };

    try {
        const response = await axios.post(API_URL, requestBody, {
            headers: {
                "Content-Type": "application/json",
                "X-Authorization": "your-auth-token", // Replace with actual token
            },
        });

        setMessage("New version created successfully!");
        console.log("Response:", response.data);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Error creating new version:", error.message);
            setMessage(error.response?.data?.message || "Failed to create new version.");
        } else {
            console.error("Unexpected error:", error);
            setMessage("Unexpected error occurred.");
        }
    }
};

const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        if (reader.result) {
            setData({ ...data, Content: reader.result.toString(), URL: "" });
        }
    };
    reader.readAsDataURL(file); // Convert file to Base64
};


return (
    <form onSubmit={handleSubmit} className="create-version-form">
        
        <h1>Update a Package</h1>
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

        <label>
            Name:
            <input
                type="text"
                value={metadata.Name}
                onChange={(e) => setMetadata({ ...metadata, Name: e.target.value })}
                placeholder="Enter package name"
                required
            />
        </label>

        <label>
            Version:
            <input
                type="text"
                value={metadata.Version}
                onChange={(e) =>
                    setMetadata({ ...metadata, Version: e.target.value })
                }
                placeholder="Enter version (e.g., 1.0.0)"
                required
            />
        </label>

        <label>
            Data Name:
            <input
                type="text"
                value={data.Name}
                onChange={(e) => setData({ ...data, Name: e.target.value })}
                placeholder="Enter data name"
                required
            />
        </label>

        <label>
            Content:
            <input type="file" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
        </label>

        <label>
            URL:
            <input
                type="text"
                value={data.URL}
                onChange={(e) => setData({ ...data, URL: e.target.value, Content: "" })}
                placeholder="Enter URL"
            />
        </label>

        <label>
            JavaScript Program:
            <textarea
                value={data.JSProgram}
                onChange={(e) => setData({ ...data, JSProgram: e.target.value })}
                placeholder="Enter JavaScript program"
                required
            ></textarea>
        </label>

        <button type="submit">Submit</button>

        {message && <p className="message">{message}</p>}
    </form>
);

};

export default CreateVersionPage;
