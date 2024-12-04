// pages/UploadPage.tsx
import React, { useState } from 'react';

import './UploadPage.css';
import axios, { AxiosResponse } from 'axios';

// Define a type for your API response
interface ApiResponse {
  metadata: {
    Name: string;
    Version: string;
    ID: string;
  };
  data: {
    Content: string;
    URL: string;
    JSProgram: string;
  };
}

const API_URL = "https://3zq0b41jvf.execute-api.us-east-1.amazonaws.com/stage1/package";

async function fetchData(): Promise<ApiResponse> {
  try {
    const response: AxiosResponse<ApiResponse> = await axios.get(`${API_URL}/resource`, {
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // If your backend uses cookies or credentials
    });

    // Log or process the response data if needed
    console.log('Fetched data:', response.data);

    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw new Error('Failed to fetch data from API.');
  }
}
const UploadPage: React.FC = () => {
  const [packageName, setPackageName] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [debloat, setDebloat] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('Inside handle submit');
    if (packageName === '' || version === '') {
      setMessage('Please fill out all fields.');
      return;
    }
    if (url === '' && !file) {
      setMessage('Please upload a package file or provide a URL, not both.');
      return;
    }
    if (file || url !== '') {
      // Mock successful submission
      //call API to upload package
      const formData = new FormData();
      formData.append('name', packageName);
      formData.append('version', version);
      formData.append('url', url);
      formData.append('file', file as Blob);
      formData.append('debloat', debloat.toString());


      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Response:', response && response.data);
      setMessage(`Package "${packageName}" uploaded successfully!`);
    } else {
      setMessage('Please upload a valid package file.');
    }

    try {
      const apiData = await fetchData(); // Call the Get Packages API
      console.log('Fetched packages:', apiData);
      setMessage(`Fetched packages successfully: ${JSON.stringify(apiData)}`);
    } catch (error) {
      console.error('Error fetching packages:', error);
      setMessage('Failed to fetch packages. Please try again.');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  return (
    <div className="upload-page">
      <h1>Upload a New Package</h1>
      <p>Upload your npm package and manage it within the custom registry.</p>

      <form onSubmit={handleSubmit} className="upload-form">
        <label>
          Package Name:
          <input
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            required
          />
        </label>

        <label>
          Version:
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
          />
        </label>

        <label>
          Package Url:
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            
          />
        </label>
        <label>
          Package File:
          <input type="file" onChange={handleFileChange} accept=".zip"  />
        </label>

        <label>
          <input
            type="checkbox"
            checked={debloat}
            onChange={(e) => setDebloat(e.target.checked)}
          />
          Enable debloat (remove unnecessary files)
        </label>

        <button type="submit" onClick={handleSubmit}>Submit</button>
        <button type="reset" onClick={() => setMessage(null)}>
          Reset
        </button>
      </form>

      {message && <p className="upload-message">{message}</p>}
    </div>
  );
};

export default UploadPage;
