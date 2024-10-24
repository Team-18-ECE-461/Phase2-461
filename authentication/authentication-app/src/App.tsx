import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import PremiumPage from './pages/PremiumPage';

const App: React.FC = () => {
  return (
    <div className="App">
      <Router>
        <div className="content">
          {/* Updated NavLink for Home */}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/">
            Home
          </NavLink>

          {/* Updated NavLink for About */}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/about">
            About
          </NavLink>

          {/* Updated NavLink for Premium Content */}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/premium">
            Premium Content
          </NavLink>
        </div>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/premium" element={<PremiumPage />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
