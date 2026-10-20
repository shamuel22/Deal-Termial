import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import './site/fonts';
import './site/tokens.css';
import './styles.css';
import ActivityPage from './pages/ActivityPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AgentsPage from './pages/AgentsPage';
import AuthorizationFormPage from './pages/AuthorizationFormPage';
import AuthorizationsPage from './pages/AuthorizationsPage';
import CatalogPage from './pages/CatalogPage';
import DashboardPage from './pages/DashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import PaymentsSettingsPage from './pages/PaymentsSettingsPage';
import ReviewPage from './pages/ReviewPage';
import SupplierNegotiationsPage from './pages/SupplierNegotiationsPage';
import SupplierRefundsPage from './pages/SupplierRefundsPage';

/** Consola del dueño bajo /console. */
export default function ConsoleRoutes() {
  return (
    <Routes>
      <Route path="console" element={<Layout />}>
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
        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
