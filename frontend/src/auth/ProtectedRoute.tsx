import React from "react";
import { AuthGuard, type AuthGuardProps } from "./AuthGuard";

export const ProtectedRoute: React.FC<AuthGuardProps> = (props) => {
  return <AuthGuard {...props} />;
};
