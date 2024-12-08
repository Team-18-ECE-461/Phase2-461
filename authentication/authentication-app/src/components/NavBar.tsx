// components/Navbar.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import './NavBar.css';
const Navbar: React.FC = () => {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/upload">Upload Package</Link>
      <Link to="/create-version">Update Version</Link>
      <Link to="/directory">Directory</Link>
      <Link to="/user-management">Cost/Rate</Link>
      <Link to="/search">Fetch Package</Link>
      <Link to="/reset">Reset Registry</Link>
    </nav>
  );
};

export default Navbar;
