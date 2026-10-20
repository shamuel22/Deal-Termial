import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { SessionProvider } from './session';
import ActivityPage from './pages/ActivityPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AgentsPage from './pages/AgentsPage';
import AuthorizationFormPage from './pages/AuthorizationFormPage';
import AuthorizationsPage from './pages/AuthorizationsPage';
import CatalogPage from './pages/CatalogPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NotificationsPage from './pages/NotificationsPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import PaymentsSettingsPage from './pages/PaymentsSettingsPage';
import RegisterPage from './pages/RegisterPage';
import ReviewPage from './pages/ReviewPage';
import SupplierNegotiationsPage from './pages/SupplierNegotiationsPage';
import SupplierRefundsPage from './pages/SupplierRefundsPage';

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:agentId" element={<AgentDetailPage />} />
            <Route path="authorizations" element={<AuthorizationsPage />} />
            <Route path="authorizations/new" element={<AuthorizationFormPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="supplier/negotiations" element={<SupplierNegotiationsPage />} />
            <Route path="supplier/refunds" element={<SupplierRefundsPage />} />
            <Route path="settings/payments" element={<PaymentsSettingsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="*" element={<p className="muted">Página no encontrada.</p>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
