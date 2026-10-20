import { lazy, Suspense } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { SessionProvider } from './session';

// Sitio público y consola en bloques separados: quien visita la landing no descarga la consola.
const LandingPage = lazy(() => import('./site/landing/LandingPage'));
const KnowledgeLayout = lazy(() => import('./site/knowledge/KnowledgeLayout'));
const KnowledgeIndex = lazy(() => import('./site/knowledge/KnowledgeIndex'));
const ArticlePage = lazy(() => import('./site/knowledge/ArticlePage'));
const ConsoleRoutes = lazy(() => import('./ConsoleRoutes'));
const SignInPage = lazy(() =>
  import('./site/auth/AuthPages').then((m) => ({ default: m.SignInPage })),
);
const RegisterPage = lazy(() =>
  import('./site/auth/AuthPages').then((m) => ({ default: m.RegisterPage })),
);
const ConsentPage = lazy(() =>
  import('./site/auth/AuthPages').then((m) => ({ default: m.ConsentPage })),
);

function ConsoleRoot() {
  return (
    <div className="dt-console">
      <Outlet />
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route index element={<LandingPage />} />
            <Route path="knowledge" element={<KnowledgeLayout />}>
              <Route index element={<KnowledgeIndex />} />
              <Route path=":slug" element={<ArticlePage />} />
            </Route>
            <Route path="login" element={<SignInPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="oauth/consent" element={<ConsentPage />} />
            <Route element={<ConsoleRoot />}>
              <Route path="*" element={<ConsoleRoutes />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  );
}
