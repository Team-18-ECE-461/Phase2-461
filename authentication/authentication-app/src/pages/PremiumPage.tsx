import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

const PremiumPage: React.FC = () => {
    return (
        <Authenticator>
            {({ signOut }) => (
                <div>
                    <h1>Hello, WELCOME</h1>
                    <h3>You are Authenticated!</h3>
                    <button onClick={signOut}>Sign Out</button>
                </div>
            )}
        </Authenticator>
    );
};

export default PremiumPage;
