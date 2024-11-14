import React, { useEffect, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { getAuthToken, fetchRoleData } from './authService'; // Adjust the import path as needed
import './UserRoleDashboard.css';
interface CognitoUserAttributes {
  sub: string;
  email?: string;
  'custom:role'?: string;
  [key: string]: string | undefined;
}


interface CognitoUser {
  username: string;
  attributes: CognitoUserAttributes;
  signInUserSession: {
    idToken: {
      jwtToken: string;
    };
  };
}

const UserRoleDashboard: React.FC = () => {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (user) {
        const token = getAuthToken(user);
        if (token) {
          const fetchedRole = await fetchRoleData(token);
          if (fetchedRole) {
            setRole(fetchedRole);
          } else {
            setError('Unable to retrieve role data');
          }
        } else {
          setError('Failed to retrieve session token');
        }
      }
    };

    fetchUserRole();
  }, [user]); // Only run when `user` changes

  return (
    <Authenticator>
      {({ signOut, user: authUser }) => {
        const typedUser = authUser as CognitoUser | undefined;
        setUser(typedUser || null); // Set user state when `authUser` changes

        return (
          <div className='user-role-dashboard'>
            {typedUser && (
              <>
                <h1>Hello, {typedUser.username}!</h1>
                <h3>Your role is: {role || 'Fetching...'}</h3>

                {role === 'Uploader' && <h2>Upload your package:</h2>}
                {role === 'Searcher' && <p>You can search for available packages here.</p>}
                {role === 'Downloader' && <p>You can download packages here.</p>}
                {!role && <p>You do not have permission to upload, search, or download packages.</p>}
                
                {error && <p style={{ color: 'red' }}>{error}</p>}

                <button onClick={signOut}>Sign Out</button>
              </>
            )}
          </div>
        );
      }}
    </Authenticator>
  );
};

export default UserRoleDashboard;
