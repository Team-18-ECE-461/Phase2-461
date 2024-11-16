import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import SignInPage from './pages/SignInPage';
import AdminPage from './pages/AdminPage';
import UploaderPage from './pages/UploaderPage';
import UserRoleDashboard from './pages/UserRoleDashboard';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import DirectoryPage from './pages/DirectoryPage';
import DetailsPage from './pages/DetailsPage';
import UserManagementPage from './pages/UserManagementPage';
import Navbar from '../../../../../../../Downloads/Phase2-461-main/Phase2-461-main/authentication/authentication-app/src/components/NavBar';

//import ErrorPage from './pages/ErrorPage';
Amplify.configure(awsExports);


const App: React.FC = () => {
  //const location = useLocation();
  return (
  
    <Router>
      <div>
     {/* {location.pathname !== '/signin' && <Navbar />} */}
      <Navbar />
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/uploader" element={<UploaderPage />} />
        <Route path="/dashboard" element={<UserRoleDashboard />} />
        <Route path="*" element={<Navigate to="/signin" />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/directory" element={<DirectoryPage />} />
        <Route path="/details/:packageId" element={<DetailsPage />} />
        <Route path="/user-management" element={<UserManagementPage />} />
      </Routes>
      </div>
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

