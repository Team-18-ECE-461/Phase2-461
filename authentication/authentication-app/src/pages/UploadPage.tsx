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

const API_URL = "https://3zq0b41jvf.execute-api.us-east-1.amazonaws.com/stage2/tracks";
async function getTracks(): Promise<ApiResponse> {
  const response = await axios.get<ApiResponse>(API_URL);
  return response.data;
}
async function fetchData(): Promise<void> {
  try {
    const response = await axios.post(`${API_URL}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const { metadata, data } = response.data;

    // Log the structured response
    console.log('Metadata:', metadata);
    console.log('Data:', data);

    console.log('Full response:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Log detailed error message if the error is Axios-related
      console.error('Error fetching data:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
    } else {
      // Log any other type of error
      console.error('Unexpected error:', error);
    }
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
    setMessage('Processing your request...');

    if (!packageName || !version) {
      setMessage('Please fill out all fields.');
      return;
    }
    if (!url && !file) {
      setMessage('Please upload a package file or provide a URL.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('name', packageName);
      formData.append('version', version);
      if (url) formData.append('url', url);
      if (file) formData.append('file', file);
      formData.append('debloat', debloat.toString());

      // const response = await axios.post(`${API_URL}`, formData, {
      //   headers: {
      //     'Content-Type': 'multipart/form-data',
      //   },
      // });
      const test = await axios.get("https://api.github.com/parvk11/Movie-Recommender")
      setMessage(`Upload Response: ${JSON.stringify(test)}`);
      // const response = await getTracks();
      // setMessage(`Upload Response: ${JSON.stringify(response)}`);
     // setMessage(`Package "${packageName}" uploaded successfully!`);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Upload error:', error.message);
        setMessage("AXIOS" + error.message);
        if (error.response) {
          setMessage(error.response.data);
          console.error('Upload response data:', error.response.data);
        }
      } else {
        console.error('Unexpected upload error:', error);
      }
      //setMessage('Failed to upload package or fetch data. Please try again.' + error);

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

        <button type="button" onClick={handleSubmit}>Submit</button>
        <button type="reset" onClick={() => setMessage(null)}>
          Reset
        </button>
      </form>

      {message && <p className="upload-message">{message}</p>}
    </div>
  );
};

export default UploadPage;