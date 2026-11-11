import React, { useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box, CircularProgress } from "@mui/material";
import { AppThemeProvider } from "./theme";
import { AuthProvider } from "./auth/AuthContext";
import { AppLayout } from "./layout/AppLayout";
import { ProtectedRoute } from "./auth/ProtectedRoute";

// Lazy-loaded pages for mobile-friendly code-splitting
const LoginPage = lazy(() => import("./features/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const NetflixUserPicker = lazy(() => import("./features/auth/NetflixUserPicker").then(m => ({ default: m.NetflixUserPicker })));
const UsersPage = lazy(() => import("./features/users/UsersPage").then(m => ({ default: m.UsersPage })));
const AccountProfilePage = lazy(() => import("./features/profile/AccountProfilePage").then(m => ({ default: m.AccountProfilePage })));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const ItemsPage = lazy(() => import("./features/items/ItemsPage").then(m => ({ default: m.ItemsPage })));
const InboxPage = lazy(() => import("./features/inbox/InboxPage").then(m => ({ default: m.InboxPage })));
const RemindersPage = lazy(() => import("./features/reminders/RemindersPage").then(m => ({ default: m.RemindersPage })));
const CategoriesPage = lazy(() => import("./features/forms/CategoriesPage").then(m => ({ default: m.CategoriesPage })));
const CategoryDetailPage = lazy(() => import("./features/forms/CategoryDetailPage").then(m => ({ default: m.CategoryDetailPage })));
const LocationsPage = lazy(() => import("./features/locations/LocationsPage").then(m => ({ default: m.LocationsPage })));
const HealthPage = lazy(() => import("./features/health/HealthPage").then(m => ({ default: m.HealthPage })));
const MovesPage = lazy(() => import("./features/moves/MovesPage").then(m => ({ default: m.MovesPage })));
const ContactsPage = lazy(() => import("./features/contacts/ContactsPage").then(m => ({ default: m.ContactsPage })));
const ActivityPage = lazy(() => import("./features/activity/ActivityPage").then(m => ({ default: m.ActivityPage })));
const TrashPage = lazy(() => import("./features/trash/TrashPage").then(m => ({ default: m.TrashPage })));
const ExpiryPage = lazy(() => import("./features/expiry/ExpiryPage").then(m => ({ default: m.ExpiryPage })));
const LabelSheetPage = lazy(() => import("./features/labels/LabelSheetPage").then(m => ({ default: m.LabelSheetPage })));
const ScanPage = lazy(() => import("./features/scan/ScanPage").then(m => ({ default: m.ScanPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));
const PrintShelfPage = lazy(() => import("./features/print/PrintShelfPage").then(m => ({ default: m.PrintShelfPage })));
const WallPage = lazy(() => import("./features/wall/WallPage").then(m => ({ default: m.WallPage })));
const NotFoundPage = lazy(() => import("./features/notfound/NotFoundPage").then(m => ({ default: m.NotFoundPage })));

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
                {/* Public Auth routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/lock" element={<NetflixUserPicker />} />

                {/* Standalone Wall Display Mode for Kitchen Tablets (redirects on 401/403) */}
                <Route path="/wall" element={<WallPage />} />

                {/* Direct QR scan redirects */}
                <Route path="/i/:id" element={<DirectItemShortcut />} />
                <Route path="/l/:id" element={<DirectLocationShortcut />} />

                {/* Protected routes */}
                <Route element={<ProtectedRoute />}>
                  {/* Standalone Printable Routes (without app chrome) */}
                  <Route path="/print/location/:id" element={<PrintShelfPage />} />
                  <Route path="/labels" element={<LabelSheetPage />} />

                  {/* Main App with Shell Layout */}
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/items" element={<ItemsPage />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/reminders" element={<RemindersPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                    <Route path="/categories/:id" element={<CategoryDetailPage />} />
                    <Route path="/locations" element={<LocationsPage />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/account" element={<AccountProfilePage />} />
                    <Route path="/profile" element={<Navigate to="/account" replace />} />
                    <Route path="/health" element={<HealthPage />} />
                    <Route path="/moves" element={<MovesPage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/activity" element={<ActivityPage />} />
                    <Route path="/trash" element={<TrashPage />} />
                    <Route path="/expiry" element={<ExpiryPage />} />
                    <Route path="/scan" element={<ScanPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>

                {/* Fallback */}
                <Route path="/404" element={<NotFoundPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </AuthProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
};

export default App;