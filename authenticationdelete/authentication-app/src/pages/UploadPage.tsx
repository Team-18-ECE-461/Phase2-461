// pages/UploadPage.tsx
import React, { useState } from 'react';
import './UploadPage.css';

const UploadPage: React.FC = () => {
  const [packageName, setPackageName] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [debloat, setDebloat] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

  
    // Here you’d typically send data to your server or backend API
    if (file) {
      // Mock successful submission
      setMessage(`Package "${packageName}" uploaded successfully!`);
    } else {
      setMessage('Please upload a valid package file.');
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
          Package File:
          <input type="file" onChange={handleFileChange} accept=".zip" required />
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
