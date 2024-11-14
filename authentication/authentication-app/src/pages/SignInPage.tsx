import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useNavigate } from 'react-router-dom';

const SignInPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Authenticator>
      
      {({ signOut, user }) => {
        if (user) {
          navigate('/dashboard');
        }
        return (
          <div>
            <h1>Sign In</h1>
            <button onClick={signOut}>Sign Out</button>
          </div>
        );
      }}
    </Authenticator>
  );
};

export default SignInPage;
