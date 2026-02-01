import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { WhatWeImport } from './components/WhatWeImport';
import { FeaturedProducts } from './components/FeaturedProducts';
import { TechnologySection } from './components/TechnologySection';
import { ImportSteps } from './components/ImportSteps';
import { ImportSimulator } from './components/ImportSimulator';
import { TrainingSection } from './components/TrainingSection';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';
import { WhatsAppButton } from './components/WhatsAppButton';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { QuotePage } from './pages/QuotePage';
import { AdminPage } from './pages/AdminPage';
import { OrdersPage } from './pages/OrdersPage';

function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <HeroSection />
        <WhatWeImport />
        <FeaturedProducts />
        <ImportSimulator />
        <TechnologySection />
        <ImportSteps />
        <TrainingSection />
        <FAQ />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/quote" 
            element={
              <ProtectedRoute>
                <QuotePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/orders" 
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminPage />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
