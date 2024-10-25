import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';  // For pre-built Amplify UI styles

interface CognitoUserAttributes {
  sub: string;
  email?: string;
  'custom:role'?: string;
  [key: string]: string | undefined; // This allows for any additional attributes
}

interface CognitoUser {
  username: string;
  attributes: CognitoUserAttributes;
}

const UserRoleDashboard: React.FC = () => {
  return (
    <Authenticator>
      {({ signOut, user }) => {
        const typedUser = user as CognitoUser | undefined;  // Cast user to custom CognitoUser type
        const role = typedUser?.attributes?.['custom:role'];

        return (
          <div>
            {typedUser && (
              <>
                <h1>Hello, {typedUser.username}!</h1>
                <h3>Your role is: {role}</h3>

                {/* Show specific content based on the user's role */}
                {role === 'Uploader' && (
                  <div>
                    <h2>Upload your package:</h2>
                  </div>
                )}

                {role === 'Searcher' && (
                  <div>
                    <h2>Search for packages:</h2>
                    <p>You can search for available packages here.</p>
                    {/* Add search functionality if needed */}
                  </div>
                )}

                {role === 'Downloader' && (
                  <div>
                    <h2>Download packages:</h2>
                    <p>You can download packages here.</p>
                    {/* Add download functionality if needed */}
                  </div>
                )}

                {/* If the user does not have any of the above roles */}
                {role !== 'Uploader' && role !== 'Searcher' && role !== 'Downloader' && (
                  <p>You do not have permission to upload, search, or download packages.</p>
                )}

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
