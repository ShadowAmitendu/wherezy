import React, { createContext, useContext, useState, useEffect } from "react";
import { api, ApiException, ProfileOut } from "../api/client";
import { UpdatePasswordDialog } from "../features/auth/UpdatePasswordDialog";

interface AuthContextType {
  authenticated: boolean;
  pinSet: boolean;
  currentProfile: ProfileOut | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  setMustChangePassword: (val: boolean) => void;
  login: (usernameOrPin: string, password?: string) => Promise<any>;
  logout: () => Promise<void>;
  selectProfile: (profileId: number, pin?: string) => Promise<ProfileOut>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  pinSet: true,
  currentProfile: null,
  isLoading: true,
  mustChangePassword: false,
  setMustChangePassword: () => {},
  login: async () => {},
  logout: async () => {},
  selectProfile: async () => { throw new Error("Not implemented"); },
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [pinSet, setPinSet] = useState<boolean>(true);
  const [currentProfile, setCurrentProfile] = useState<ProfileOut | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshAuth = async () => {
    try {
      const status = await api.getAuthStatus();
      setPinSet(Boolean(status.pin_set));
      if (status.authenticated && status.current_profile) {
        setAuthenticated(true);
        setCurrentProfile(status.current_profile);
        setMustChangePassword(Boolean(status.current_profile.must_change_password));
      } else {
        setAuthenticated(false);
        setCurrentProfile(null);
        setMustChangePassword(false);
      }
    } catch {
      setAuthenticated(false);
      setCurrentProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (usernameOrPin: string, password?: string) => {
    try {
      let res;
      if (password !== undefined) {
        res = await api.login({ username: usernameOrPin, password });
      } else {
        res = await api.login({ pin: usernameOrPin });
      }

      setAuthenticated(true);
      if (res.profile) {
        setCurrentProfile(res.profile);
        setMustChangePassword(Boolean(res.must_change_password || res.profile.must_change_password));
      } else {
        await refreshAuth();
      }
      return res;
    } catch (err) {
      setAuthenticated(false);
      throw err;
    }
  };

  const selectProfile = async (profileId: number, pin?: string): Promise<ProfileOut> => {
    try {
      const prof = await api.selectProfile(profileId, pin);
      setAuthenticated(true);
      setCurrentProfile(prof);
      setMustChangePassword(Boolean(prof.must_change_password));
      return prof;
    } catch (err) {
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    } finally {
      setAuthenticated(false);
      setCurrentProfile(null);
      setMustChangePassword(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        pinSet,
        currentProfile,
        isLoading,
        mustChangePassword,
        setMustChangePassword,
        login,
        logout,
        selectProfile,
        refreshAuth,
      }}
    >
      {children}

      {/* Global forced password update dialog on first login */}
      <UpdatePasswordDialog
        open={authenticated && mustChangePassword}
        requireOldPassword={false}
      />
    </AuthContext.Provider>
  );
};
