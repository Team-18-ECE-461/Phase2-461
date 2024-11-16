// pages/DirectoryPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DirectoryPage.css';

interface Package {
  id: string;
  name: string;
  version: string;
  rating: number;
  size: string;
}

const DirectoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<Package[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRating, setFilterRating] = useState<number | null>(null);

  useEffect(() => {
    // Mock API call to fetch packages
    const fetchPackages = async () => {
      const data: Package[] = [
        { id: '1', name: 'example-package', version: '1.0.0', rating: 4.5, size: '15 MB' },
        { id: '2', name: 'another-package', version: '2.0.1', rating: 3.9, size: '20 MB' },
        // Add more mock packages here
      ];
      setPackages(data);
    };

    fetchPackages();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterRating(Number(e.target.value) || null);
  };

  const filteredPackages = packages.filter((pkg) => {
    return (
      pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterRating === null || pkg.rating >= filterRating)
    );
  });

  return (
    <div className="directory-page">
      <h1>Package Directory</h1>

      <div className="directory-controls">
        <input
          type="text"
          placeholder="Search packages..."
          value={searchTerm}
          onChange={handleSearch}
          className="search-input"
        />

        <select onChange={handleFilterChange} className="filter-select">
          <option value="">Filter by rating</option>
          <option value="4">4 stars & above</option>
          <option value="3">3 stars & above</option>
          <option value="2">2 stars & above</option>
          <option value="1">1 star & above</option>
        </select>
      </div>

      <div className="package-list">
        {filteredPackages.map((pkg) => (
          <div key={pkg.id} className="package-item">
            <h2>{pkg.name}</h2>
            <p>Version: {pkg.version}</p>
            <p>Rating: {pkg.rating} ★</p>
            <p>Size: {pkg.size}</p>
            <button onClick={() => navigate(`/details/${pkg.id}`)}>View Details</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DirectoryPage;
