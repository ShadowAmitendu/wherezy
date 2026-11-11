import { createContext, useContext } from "react";
import type { ProfileOut } from "../api/client";

export interface AuthContextType {
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

export const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  pinSet: true,
  currentProfile: null,
  isLoading: true,
  mustChangePassword: false,
  setMustChangePassword: () => {},
  login: async () => {},
  logout: async () => {},
  selectProfile: async () => {
    throw new Error("Not implemented");
  },
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);
