import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignInPage from './pages/SignInPage';
import AdminPage from './pages/AdminPage';
import UploaderPage from './pages/UploaderPage';
import UserRoleDashboard from './pages/UserRoleDashboard';
import ErrorPage from './pages/ErrorPage';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/uploader" element={<UploaderPage />} />
        <Route path="/dashboard" element={<UserRoleDashboard />} />
        <Route path="*" element={<Navigate to="/signin" />} />
      </Routes>
    </Router>
  );
};

export default App;















/*import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import Administrators from './pages/Administrators';

const App: React.FC = () => {
  return (
    <div className="App">
      <Router>
        <div className="content">
          {}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/">
            Home
          </NavLink>

          {}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/about">
            About
          </NavLink>

          {}
          <NavLink 
            className={({ isActive }) => `content ${isActive ? 'active' : ''}`} 
            to="/administrators">
            Premium Content
          </NavLink>
        </div>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/administrators" element={<Administrators />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;

*/

