import React, { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppThemeProvider } from "./theme";
import { AuthProvider } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";

// Pages
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ItemsPage } from "./features/items/ItemsPage";
import { CategoriesPage } from "./features/forms/CategoriesPage";
import { CategoryDetailPage } from "./features/forms/CategoryDetailPage";
import { LocationsPage } from "./features/locations/LocationsPage";
import { ExpiryPage } from "./features/expiry/ExpiryPage";
import { LabelSheetPage } from "./features/labels/LabelSheetPage";
import { ScanPage } from "./features/scan/ScanPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PrintShelfPage } from "./features/print/PrintShelfPage";

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
          </HashRouter>
        </AuthProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
