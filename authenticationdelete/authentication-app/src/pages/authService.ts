// src/authService.ts

export const getAuthToken = (user: any): string | null => {
    // Retrieve the JWT token from the user's session, if available
    return user?.signInUserSession?.idToken?.jwtToken || null;
  };
  
  export const fetchRoleData = async (token: string): Promise<string | null> => {
    try {
      const response = await fetch('https://<API-GATEWAY-URL>/getRole', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`, // Send the token as Bearer
        },
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch role data');
      }
  
      const data = await response.json();
      return data.role; // Assuming the API returns { role: "role-name" }
    } catch (error) {
      console.error('Error fetching role data:', error);
      return null;
    }
  };
  