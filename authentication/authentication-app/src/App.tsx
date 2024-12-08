import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate} from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import SignInPage from './pages/SignInPage';
import AdminPage from './pages/AdminPage';
import UploaderPage from './pages/UploaderPage';
import UserRoleDashboard from './pages/UserRoleDashboard';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import DirectoryPage from './pages/DirectoryPage';
import UserManagementPage from './pages/UserManagementPage';
import Navbar from './components/NavBar';
import Search from './pages/Search';
import CreateVersionPage from './pages/createVersion';
import ResetRegistryPage from './pages/Reset';
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
        <Route path="/user-management" element={<UserManagementPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/reset" element={<ResetRegistryPage />} />
        <Route path="/create-version" element={<CreateVersionPage />} />
      </Routes>
      </div>
    </Router>
    
  );
};
export default App;


