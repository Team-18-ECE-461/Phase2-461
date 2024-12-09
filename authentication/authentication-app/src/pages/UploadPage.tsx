import React, { useState } from 'react';
import './UploadPage.css';
import axios from 'axios';

// Define the type for the API response
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

// Updated to point to your local backend proxy
const API_URL = "http://localhost:5000/api/package"; // Point to your local backend

const UploadPage: React.FC = () => {
  const [packageName, setPackageName] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [debloat, setDebloat] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
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
      const requestBodyfile = {
        Content: file ? await convertFileToBase64(file) : '', // Convert file to base64
        JSProgram: `if (process.argv.length === 7) {\nconsole.log('Success')\nprocess.exit(0)\n} else {\nconsole.log('Failed')\nprocess.exit(1)\n}`,
        debloat,
        Name: packageName,
      };

      const requestBodyURL = {
        URL: url,
        JSProgram: `if (process.argv.length === 7) {\nconsole.log('Success')\nprocess.exit(0)\n} else {\nconsole.log('Failed')\nprocess.exit(1)\n}`,
        debloat,
        Name: packageName,
      };

      // If URL is provided, use URL request body
      if (url) {
        const response = await axios.post(API_URL, requestBodyURL, {
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': '', // Add authorization if needed
          },
        });

        setMessage(`Upload Response: ${JSON.stringify(response.data)}`);
      }
      // If file is provided, use file request body
      else if (file) {
        const response = await axios.post(API_URL, requestBodyfile, {
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': '', // Add authorization if needed
          },
        });

        setMessage(`Upload Response: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Upload error:', error.message);
        setMessage('AXIOS: ' + error.message);
        if (error.response) {
          setMessage(error?.response?.data?.message || 'Failed to upload package.');
          console.error('Upload response data:', error.response.data);
        }
      } else {
        console.error('Unexpected upload error:', error);
        setMessage('Unexpected error occurred.');
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  // Convert file to base64 string
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
          <input type="file" onChange={handleFileChange} accept=".zip" />
        </label>

        <label>
          <input
            type="checkbox"
            checked={debloat}
            onChange={(e) => setDebloat(e.target.checked)}
          />
          Enable debloat (remove unnecessary files)
        </label>

        <button type="submit">Submit</button>
        <button type="reset" onClick={() => setMessage(null)}>
          Reset
        </button>
      </form>

      {message && <p className="upload-message">{message}</p>}
    </div>
  );
};

export default UploadPage;
