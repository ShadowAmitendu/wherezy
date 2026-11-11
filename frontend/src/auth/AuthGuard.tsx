import React from "react";
import { Navigate, Outlet, Link as RouterLink, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import LockPersonOutlinedIcon from "@mui/icons-material/LockPersonOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import { useAuth } from "./useAuth";
import type { ProfileOut } from "../api/client";
import {
  getSafeRedirectTarget,
  isAuthorizedForGuard,
  type GuardCheckOptions,
} from "./permissions";

export interface AuthGuardProps extends GuardCheckOptions {
  /** Render inline guarded content instead of acting as a React Router layout route (<Outlet />). */
  children?: React.ReactNode;
  /** Redirect away when user IS already authenticated (e.g. /login). */
  guestOnly?: boolean;
  /** Login route used when unauthenticated in route mode (default: "/login"). */
  loginPath?: string;
  /** Optional redirect destination when forbidden in route mode or authenticated in guestOnly mode. */
  redirectTo?: string;
  /** Optional fallback UI when access is denied. Defaults to null inline, or a 403 card in route mode. */
  fallback?: React.ReactNode;
}

function hasGuardConstraints(options: GuardCheckOptions): boolean {
  return Boolean(
    (options.roles && options.roles.length > 0) ||
      options.permission ||
      (options.anyPermissions && options.anyPermissions.length > 0) ||
      (options.allPermissions && options.allPermissions.length > 0)
  );
}

const AccessRestrictedView: React.FC<{ profile: ProfileOut | null }> = ({ profile }) => (
  <Box
    sx={{
      minHeight: "70vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      p: 3,
    }}
  >
    <Card
      elevation={0}
      sx={{
        maxWidth: 460,
        width: "100%",
        border: 1,
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      <CardContent sx={{ p: 4, textAlign: "center" }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            bgcolor: "warning.main",
            color: "warning.contrastText",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 2,
            opacity: 0.9,
          }}
        >
          <LockPersonOutlinedIcon fontSize="large" />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
          Access Restricted
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Your current profile does not have permission to view this page or perform this action.
        </Typography>

        {profile && (
          <Stack direction="row" spacing={1} sx={{ mb: 3, justifyContent: "center" }}>
            <Chip label={profile.name} size="small" variant="outlined" />
            <Chip
              label={`Role: ${profile.role}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Stack>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "center" }}>
          <Button
            component={RouterLink}
            to="/"
            variant="contained"
            startIcon={<HomeOutlinedIcon />}
          >
            Go to Dashboard
          </Button>
          <Button
            component={RouterLink}
            to="/lock"
            variant="outlined"
            startIcon={<SwitchAccountOutlinedIcon />}
          >
            Switch Profile
          </Button>
        </Stack>
      </CardContent>
    </Card>
  </Box>
);

const InlineAuthGuard: React.FC<AuthGuardProps> = ({
  children,
  roles,
  permission,
  anyPermissions,
  allPermissions,
  allowDisplay = false,
  guestOnly = false,
  fallback = null,
}) => {
  const { authenticated, currentProfile, isLoading } = useAuth();

  if (isLoading) return null;

  if (guestOnly) {
    return authenticated ? <>{fallback}</> : <>{children}</>;
  }

  if (!authenticated) {
    return <>{fallback}</>;
  }

  if (currentProfile?.is_display && !allowDisplay) {
    return <>{fallback}</>;
  }

  const constraints = { roles, permission, anyPermissions, allPermissions, allowDisplay };
  if (hasGuardConstraints(constraints) && !isAuthorizedForGuard(currentProfile, constraints)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

const RouteAuthGuard: React.FC<Omit<AuthGuardProps, "children">> = ({
  roles,
  permission,
  anyPermissions,
  allPermissions,
  allowDisplay = false,
  guestOnly = false,
  loginPath = "/login",
  redirectTo,
  fallback,
}) => {
  const { authenticated, currentProfile, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (guestOnly) {
    if (authenticated) {
      const defaultTarget = currentProfile?.is_display ? "/wall" : (redirectTo ?? "/");
      const target = currentProfile?.is_display
        ? "/wall"
        : getSafeRedirectTarget(location.state, defaultTarget);
      return <Navigate to={target} replace />;
    }
    return <Outlet />;
  }

  if (!authenticated) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (currentProfile?.is_display && !allowDisplay) {
    return <Navigate to="/wall" replace />;
  }

  const constraints = { roles, permission, anyPermissions, allPermissions, allowDisplay };
  if (hasGuardConstraints(constraints) && !isAuthorizedForGuard(currentProfile, constraints)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    return <AccessRestrictedView profile={currentProfile} />;
  }

  return <Outlet />;
};

export const AuthGuard: React.FC<AuthGuardProps> = ({ children, ...rest }) => {
  if (children !== undefined) {
    return <InlineAuthGuard {...rest}>{children}</InlineAuthGuard>;
  }
  return <RouteAuthGuard {...rest} />;
};
