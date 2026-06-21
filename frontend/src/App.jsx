import React, { useState } from 'react';
import PublicForm from './components/PublicForm';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminLanding from './components/AdminLanding';
import './i18n'; // Bootstrap i18next configuration

export default function App() {
  const [view, setView] = useState('form'); // 'form' | 'admin' | 'login' | 'dashboard'



  const handleNavigate = (newView) => {
    setView(newView);
  };

  const handleLoginSuccess = () => {
    handleNavigate('dashboard');
  };

  const handleOpenAdmin = () => {
    handleNavigate('admin');
  };

  const handleLogout = () => {
    handleNavigate('login');
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950 font-sans">
      {view === 'form' && (
        <PublicForm 
          onNavigateToLogin={() => handleNavigate('login')}
          onNavigateToAdmin={handleOpenAdmin}
        />
      )}

      {view === 'admin' && (
        <AdminLanding
          onEnterAdmin={() => {
            const token = localStorage.getItem('sentra_admin_token');
            handleNavigate(token ? 'dashboard' : 'login');
          }}
          onBackToUser={() => handleNavigate('form')}
        />
      )}
      
      {view === 'login' && (
        <Login 
          onLoginSuccess={handleLoginSuccess}
          onBackToForm={() => handleNavigate('admin')}
        />
      )}
      
      {view === 'dashboard' && (
        <Dashboard 
          onLogout={handleLogout}
          onBackToUser={() => handleNavigate('form')}
        />
      )}
    </div>
  );
}
