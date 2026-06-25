import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { ProductDetail } from './pages/ProductDetail';
import { CreateProduct } from './pages/CreateProduct';
import { AddVariant } from './pages/AddVariant';
import { VariantEdit } from './pages/VariantEdit';
import { VariantView } from './pages/VariantView';
import { BatchDetail } from './pages/BatchDetail';
import { ProductEdit } from './pages/ProductEdit';
import { BatchView } from './pages/BatchView';
import { Partners } from './pages/Partners';
import { PartnerDetail } from './pages/PartnerDetail';
import { CreatePartner } from './pages/CreatePartner';
import { Dpps } from './pages/Dpps';
import { DppDetail } from './pages/DppDetail';
import { Marketing } from './pages/Marketing';
import { Boms } from './pages/Boms';
import { ComingSoon } from './pages/ComingSoon';
import { BatchEdit } from './pages/BatchEdit';
import { PartnerEdit } from './pages/PartnerEdit';
import { Login } from './pages/Login';
import { PasswordReset } from './pages/PasswordReset';
import { Settings } from './pages/Settings';
import { ProfileSettings } from './pages/ProfileSettings';
import { AppearanceSettings } from './pages/AppearanceSettings';
import { ActivityLogs } from './pages/ActivityLogs';
import { ReportsLanding } from './pages/ReportsLanding';
import { SustainabilityAnalytics } from './pages/SustainabilityAnalytics';
import { ComplianceAnalytics } from './pages/ComplianceAnalytics';

export function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('appearanceTheme') || 'green';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — rendered OUTSIDE AppShell (no me() / no auth gate). */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<PasswordReset />} />

        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />

          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<CreateProduct />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="products/:id/edit" element={<ProductEdit />} />
          <Route path="products/:pid/variants/new" element={<AddVariant />} />
          <Route path="products/:pid/variants/:vid" element={<VariantEdit />} />
          <Route path="products/:pid/variants/:vid/view" element={<VariantView />} />
          <Route path="products/:pid/variants/:vid/batches" element={<BatchView />} />
          <Route path="products/:pid/variants/:vid/batches/:bid" element={<BatchDetail />} />
          <Route path="products/:pid/variants/:vid/batches/:bid/edit" element={<BatchEdit />} />
          <Route
            path="/products/:pid/variants/:vid/batches/:bid"
            element={<BatchDetail />}
          />
          <Route path="partners" element={<Partners />} />
          <Route path="partners/new" element={<CreatePartner />} />
          <Route path="partners/:id" element={<PartnerDetail />} />
          <Route path="partners/:id/edit" element={<PartnerEdit />} />

          <Route path="dpps" element={<Dpps />} />
          <Route path="dpps/:id" element={<DppDetail />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="boms" element={<Boms />} />


          <Route path="/profile" element={<ProfileSettings />} />
          <Route path="/appearance" element={<AppearanceSettings />} />

          <Route path="reports" element={<ReportsLanding />} />
          <Route path="reports/sustainability" element={<SustainabilityAnalytics />} />
          <Route path="reports/compliance" element={<ComplianceAnalytics />} />

          {/* Sidebar items without backend yet */}
          <Route path="validation" element={<ComingSoon title="Validation" />} />
          
          
          <Route path="settings" element={<Settings />} />
          <Route
            path="/activity-logs"
            element={<ActivityLogs />}
          />


          <Route path="*" element={<ComingSoon title="Not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
