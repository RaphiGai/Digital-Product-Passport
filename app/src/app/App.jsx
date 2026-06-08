import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { ProductDetail } from './pages/ProductDetail';
import { CreateProduct } from './pages/CreateProduct';
import { AddVariant } from './pages/AddVariant';
import { VariantEdit } from './pages/VariantEdit';
import { BatchView } from './pages/BatchView';
import { Partners } from './pages/Partners';
import { PartnerDetail } from './pages/PartnerDetail';
import { CreatePartner } from './pages/CreatePartner';
import { Dpps } from './pages/Dpps';
import { DppDetail } from './pages/DppDetail';
import { ComingSoon } from './pages/ComingSoon';
import { BatchEdit } from './pages/BatchEdit';
import { PartnerEdit } from './pages/PartnerEdit';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />

          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<CreateProduct />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="products/:pid/variants/new" element={<AddVariant />} />
          <Route path="products/:pid/variants/:vid" element={<VariantEdit />} />
          <Route path="products/:pid/variants/:vid/batches" element={<BatchView />} />
          <Route path="products/:pid/variants/:vid/batches/:bid/edit" element={<BatchEdit />} />

          <Route path="partners" element={<Partners />} />
          <Route path="partners/new" element={<CreatePartner />} />
          <Route path="partners/:id" element={<PartnerDetail />} />
          <Route path="partners/:id/edit" element={<PartnerEdit />} />

          <Route path="dpps" element={<Dpps />} />
          <Route path="dpps/:id" element={<DppDetail />} />

          {/* Sidebar items without backend yet */}
          <Route path="validation" element={<ComingSoon title="Validation" />} />
          <Route path="reports" element={<ComingSoon title="Reports" />} />
          <Route path="settings" element={<ComingSoon title="Settings" />} />

          <Route path="*" element={<ComingSoon title="Not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
