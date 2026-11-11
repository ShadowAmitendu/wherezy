import React, { useState, useEffect, useCallback } from "react";
import { api, setUnauthorizedHandler, type ProfileOut } from "../api/client";
import { UpdatePasswordDialog } from "../features/auth/UpdatePasswordDialog";
import { AuthContext } from "./useAuth";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [pinSet, setPinSet] = useState<boolean>(true);
  const [currentProfile, setCurrentProfile] = useState<ProfileOut | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyAuthStatus = useCallback((status: Awaited<ReturnType<typeof api.getAuthStatus>>) => {
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
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      applyAuthStatus(status);
    } catch {
      setAuthenticated(false);
      setCurrentProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyAuthStatus]);

  useEffect(() => {
    let active = true;
    api
      .getAuthStatus()
      .then((status) => {
        if (active) applyAuthStatus(status);
      })
      .catch(() => {
        if (active) {
          setAuthenticated(false);
          setCurrentProfile(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyAuthStatus]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthenticated(false);
      setCurrentProfile(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = async (usernameOrPin: string, password?: string) => {
    try {
      const res =
        password !== undefined
          ? await api.login({ username: usernameOrPin, password })
          : await api.login({ pin: usernameOrPin });

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
    const prof = await api.selectProfile(profileId, pin);
    setAuthenticated(true);
    setCurrentProfile(prof);
    setMustChangePassword(Boolean(prof.must_change_password));
    return prof;
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
