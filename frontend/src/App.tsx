import React, { useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box, CircularProgress } from "@mui/material";
import { AppThemeProvider } from "./theme";
import { AuthProvider } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";

// Lazy-loaded pages for mobile-friendly code-splitting
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const ItemsPage = lazy(() => import("./features/items/ItemsPage").then(m => ({ default: m.ItemsPage })));
const CategoriesPage = lazy(() => import("./features/forms/CategoriesPage").then(m => ({ default: m.CategoriesPage })));
const CategoryDetailPage = lazy(() => import("./features/forms/CategoryDetailPage").then(m => ({ default: m.CategoryDetailPage })));
const LocationsPage = lazy(() => import("./features/locations/LocationsPage").then(m => ({ default: m.LocationsPage })));
const ExpiryPage = lazy(() => import("./features/expiry/ExpiryPage").then(m => ({ default: m.ExpiryPage })));
const LabelSheetPage = lazy(() => import("./features/labels/LabelSheetPage").then(m => ({ default: m.LabelSheetPage })));
const ScanPage = lazy(() => import("./features/scan/ScanPage").then(m => ({ default: m.ScanPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));
const PrintShelfPage = lazy(() => import("./features/print/PrintShelfPage").then(m => ({ default: m.PrintShelfPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Shortcuts for native camera QR links: /#/i/:id and /#/l/:id
const DirectItemShortcut: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/items?selected=${id}`, { replace: true });
  }, [id, navigate]);
  return null;
};

const DirectLocationShortcut: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/print/location/${id}`, { replace: true });
  }, [id, navigate]);
  return null;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <AuthProvider>
          <HashRouter>
            <Suspense
              fallback={
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
                  <CircularProgress size={36} />
                </Box>
              }
            >
              <Routes>
                {/* Standalone Printable Routes (without app chrome) */}
                <Route path="/print/location/:id" element={<PrintShelfPage />} />
                <Route path="/labels" element={<LabelSheetPage />} />

                {/* Direct QR scan redirects */}
                <Route path="/i/:id" element={<DirectItemShortcut />} />
                <Route path="/l/:id" element={<DirectLocationShortcut />} />

                {/* Main App with Shell Layout */}
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/items" element={<ItemsPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/categories/:id" element={<CategoryDetailPage />} />
                  <Route path="/locations" element={<LocationsPage />} />
                  <Route path="/expiry" element={<ExpiryPage />} />
                  <Route path="/scan" element={<ScanPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </AuthProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
