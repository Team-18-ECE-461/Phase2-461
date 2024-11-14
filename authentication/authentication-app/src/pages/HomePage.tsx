import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="homepage">
    
      <header className="homepage-header">
        <h1>Welcome to the Module Registry</h1>
        <p>Your trusted source for npm module management and verification.</p>
      </header>

      <section className="homepage-features">
        <h2>Features</h2>
        <ul>
          <li>Upload and manage new packages with ease</li>
          <li>Search for and explore verified packages in the directory</li>
          <li>Access detailed package information and versioning</li>
          <li>Manage user roles and permissions (Admin only)</li>
        </ul>
      </section>

      <section className="homepage-actions">
        <button onClick={() => navigate('/upload')} className="action-button">
          Upload Package
        </button>
        <button onClick={() => navigate('/directory')} className="action-button">
          View Directory
        </button>
        <button onClick={() => navigate('/user-role-dashboard')} className="action-button">
          Profile
        </button>
      </section>
    </div>
  );
};

export default HomePage;
