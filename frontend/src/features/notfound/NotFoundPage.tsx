import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Fade,
  Grow,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LoginIcon from "@mui/icons-material/Login";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { HEADING_FONT_FAMILY } from "../../theme/themeConstants";

export const NotFoundPage: React.FC = () => {
  useDocumentTitle("404 - Page Not Found");
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticated, isLoading } = useAuth();

  const requestedPath = `${location.pathname}${location.search}`;
  const showRequestedPath = Boolean(
    location.pathname && location.pathname !== "/404",
  );
  const showSignedInActions = authenticated;
  const fallbackTarget = showSignedInActions || isLoading ? "/" : "/login";

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackTarget, { replace: true });
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3 },
        bgcolor: "background.default",
        backgroundImage: (theme) =>
          `radial-gradient(circle at 20% 20%, ${alpha(
            theme.palette.primary.main,
            theme.palette.mode === "dark" ? 0.14 : 0.08,
          )} 0%, transparent 45%), radial-gradient(circle at 80% 80%, ${alpha(
            theme.palette.secondary.main,
            theme.palette.mode === "dark" ? 0.12 : 0.07,
          )} 0%, transparent 45%)`,
      }}
    >
      <Fade in appear timeout={240}>
        <Box sx={{ width: "100%", maxWidth: 460 }}>
          <Grow in appear timeout={320}>
            <Card
              elevation={6}
              sx={{
                width: "100%",
                borderRadius: 2,
                p: { xs: 1.5, sm: 2.5 },
                border: "1px solid",
                borderColor: "divider",
                boxShadow: (theme) =>
                  theme.palette.mode === "dark"
                    ? "0 12px 36px rgba(0, 0, 0, 0.55)"
                    : "0 12px 36px rgba(0, 0, 0, 0.08)",
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, textAlign: "center" }}>
                {/* Subtle App Brand Header */}
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    mb: { xs: 2, sm: 2.5 },
                    opacity: 0.85,
                  }}
                >
                  <Inventory2OutlinedIcon
                    fontSize="small"
                    sx={{ color: "primary.main" }}
                  />
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontFamily: HEADING_FONT_FAMILY,
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Wherezy
                  </Typography>
                </Box>

                {/* 404 Visual Emblem */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 56, sm: 64 },
                      height: { xs: 56, sm: 64 },
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: (theme) =>
                        alpha(
                          theme.palette.primary.main,
                          theme.palette.mode === "dark" ? 0.18 : 0.1,
                        ),
                      color: "primary.main",
                      border: "1px solid",
                      borderColor: (theme) =>
                        alpha(theme.palette.primary.main, 0.28),
                    }}
                  >
                    <SearchOffRoundedIcon
                      sx={{ fontSize: { xs: 30, sm: 34 } }}
                    />
                  </Box>

                  <Chip
                    label="HTTP 404"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: { xs: "0.7rem", sm: "0.75rem" },
                      letterSpacing: "0.06em",
                    }}
                  />
                </Box>

                {/* Display Code & Heading */}
                <Typography
                  component="h1"
                  sx={{
                    fontFamily: HEADING_FONT_FAMILY,
                    fontWeight: 800,
                    fontSize: { xs: "3rem", sm: "4.25rem" },
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                    color: "text.primary",
                    mb: 1,
                  }}
                >
                  404
                </Typography>

                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: "1.15rem", sm: "1.4rem" },
                    mb: 1,
                  }}
                >
                  Page not found
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    maxWidth: 360,
                    mx: "auto",
                    fontSize: { xs: "0.825rem", sm: "0.9375rem" },
                    mb: showRequestedPath ? 2 : 0,
                  }}
                >
                  The page you are looking for does not exist or may have been
                  moved.
                </Typography>

                {showRequestedPath && (
                  <Box
                    component="code"
                    sx={{
                      display: "inline-block",
                      maxWidth: "100%",
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 1,
                      bgcolor: "action.hover",
                      border: "1px solid",
                      borderColor: "divider",
                      fontFamily: "var(--font-mono)",
                      fontSize: { xs: "0.75rem", sm: "0.8125rem" },
                      color: "text.secondary",
                      wordBreak: "break-all",
                    }}
                  >
                    {requestedPath}
                  </Box>
                )}

                <Divider sx={{ my: { xs: 2, sm: 2.5 } }} />

                {/* Navigation Actions */}
                <Stack spacing={1.25}>
                  {!isLoading && !authenticated ? (
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      startIcon={<LoginIcon />}
                      onClick={() => navigate("/login")}
                      sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        borderRadius: 1,
                      }}
                    >
                      Sign In to Continue
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      startIcon={<HomeOutlinedIcon />}
                      onClick={() => navigate("/")}
                      sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        borderRadius: 1,
                      }}
                    >
                      Back to Dashboard
                    </Button>
                  )}

                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ArrowBackIcon />}
                      onClick={handleGoBack}
                      sx={{ textTransform: "none" }}
                    >
                      Go Back
                    </Button>

                    {showSignedInActions ? (
                      <>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Inventory2OutlinedIcon />}
                          onClick={() => navigate("/items")}
                          sx={{ textTransform: "none" }}
                        >
                          Browse Items
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<QrCodeScannerOutlinedIcon />}
                          onClick={() => navigate("/scan")}
                          sx={{ textTransform: "none" }}
                        >
                          Scan QR
                        </Button>
                      </>
                    ) : (
                      !isLoading && (
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<GroupOutlinedIcon />}
                          onClick={() => navigate("/lock")}
                          sx={{ textTransform: "none" }}
                        >
                          Profile Picker
                        </Button>
                      )
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grow>
        </Box>
      </Fade>
    </Box>
  );
};
